from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from import_parsers.dedupe import build_dedupe_key
from import_registry import get_bank_import
from logging_config import get_logger
from models import (
    Bank,
    BankAccount,
    Holding,
    ImportBatch,
    NetWorthSnapshot,
    Transaction,
    TransactionType,
)
from schemas import (
    HoldingResponse,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    ImportPreviewRow,
    NetWorthHistoryPoint,
    TransactionResponse,
)
from services.market_data import market_data

logger = get_logger()


def compute_cash(db: Session) -> float:
    txs = db.query(Transaction).all()
    return round(sum(t.amount if t.type == TransactionType.income else -t.amount for t in txs), 2)


def holding_to_response(
    h: Holding, force_refresh: bool = False, db: Optional[Session] = None
) -> HoldingResponse:
    current_price, source, as_of = market_data.get_price(h.symbol, force_refresh=force_refresh, db=db)
    if current_price <= 0:
        current_price = h.purchase_price
        source = "fallback_purchase"
        as_of = None
    value = round(h.shares * current_price, 2)
    return HoldingResponse(
        id=h.id,
        symbol=h.symbol,
        shares=h.shares,
        purchase_price=h.purchase_price,
        purchase_date=h.purchase_date,
        current_price=round(current_price, 2),
        value=value,
        price_source=source,
        price_as_of=as_of,
    )


def compute_portfolio(db: Session) -> Tuple[float, Dict[str, str]]:
    holdings = db.query(Holding).all()
    total = 0.0
    sources: Dict[str, str] = {}
    for h in holdings:
        resp = holding_to_response(h, db=db)
        total += resp.value
        sources[h.symbol] = resp.price_source
    return round(total, 2), sources


def compute_portfolio_as_of(db: Session, as_of: date) -> float:
    holdings = db.query(Holding).filter(Holding.purchase_date <= as_of).all()
    total = 0.0
    for h in holdings:
        total += holding_to_response(h, db=db).value
    return round(total, 2)


def build_net_worth_history(db: Session) -> List[NetWorthHistoryPoint]:
    txs = db.query(Transaction).order_by(Transaction.date.asc(), Transaction.id.asc()).all()
    holdings = db.query(Holding).all()

    if not txs and not holdings:
        return []

    by_date: Dict[date, List[Transaction]] = {}
    for tx in txs:
        by_date.setdefault(tx.date, []).append(tx)

    timeline: set = set(by_date.keys())
    for h in holdings:
        timeline.add(h.purchase_date)
    dates = sorted(timeline)

    cash = 0.0
    points: List[NetWorthHistoryPoint] = []
    for d in dates:
        for tx in by_date.get(d, []):
            cash += tx.amount if tx.type == TransactionType.income else -tx.amount
        cash = round(cash, 2)
        portfolio = compute_portfolio_as_of(db, d)
        points.append(
            NetWorthHistoryPoint(
                date=d.isoformat(),
                cash=cash,
                portfolio=portfolio,
                total=round(cash + portfolio, 2),
            )
        )

    today = date.today()
    final_cash = compute_cash(db)
    final_portfolio, _ = compute_portfolio(db)
    final_total = round(final_cash + final_portfolio, 2)
    today_iso = today.isoformat()

    if not points:
        points.append(
            NetWorthHistoryPoint(
                date=today_iso,
                cash=final_cash,
                portfolio=final_portfolio,
                total=final_total,
            )
        )
    else:
        last = points[-1]
        if last.date == today_iso:
            if last.cash != final_cash or last.portfolio != final_portfolio:
                points[-1] = NetWorthHistoryPoint(
                    date=today_iso,
                    cash=final_cash,
                    portfolio=final_portfolio,
                    total=final_total,
                )
        elif dates[-1] < today or last.total != final_total:
            points.append(
                NetWorthHistoryPoint(
                    date=today_iso,
                    cash=final_cash,
                    portfolio=final_portfolio,
                    total=final_total,
                )
            )

    points.reverse()
    return points


def record_net_worth_snapshot(db: Session) -> None:
    cash = compute_cash(db)
    portfolio, _ = compute_portfolio(db)
    snap = NetWorthSnapshot(cash=cash, portfolio=portfolio, total=round(cash + portfolio, 2))
    db.add(snap)
    db.commit()


def get_or_create_bank(db: Session, slug: str, name: str) -> Bank:
    bank = db.query(Bank).filter(Bank.slug == slug).first()
    if bank:
        return bank
    bank = Bank(slug=slug, name=name)
    db.add(bank)
    db.flush()
    db.refresh(bank)
    return bank


def get_or_create_bank_account(db: Session, bank: Bank, account_mask: str) -> BankAccount:
    acc = (
        db.query(BankAccount)
        .filter(BankAccount.bank_id == bank.id, BankAccount.account_mask == account_mask)
        .first()
    )
    if acc:
        return acc
    label = f"{bank.name} ···{account_mask}"
    acc = BankAccount(
        bank_id=bank.id,
        account_mask=account_mask,
        label=label,
        account_type="credit_card",
    )
    db.add(acc)
    db.flush()
    db.refresh(acc)
    return acc


def account_display_map(db: Session, account_ids: List[int]) -> Dict[int, str]:
    if not account_ids:
        return {}
    rows = (
        db.query(BankAccount, Bank)
        .join(Bank, Bank.id == BankAccount.bank_id)
        .filter(BankAccount.id.in_(account_ids))
        .all()
    )
    out: Dict[int, str] = {}
    for acc, bank in rows:
        out[acc.id] = acc.label or f"{bank.name} ···{acc.account_mask}"
    return out


def transaction_to_response(tx: Transaction, displays: Dict[int, str]) -> TransactionResponse:
    return TransactionResponse(
        id=tx.id,
        date=tx.date,
        type=tx.type.value if hasattr(tx.type, "value") else str(tx.type),
        category=tx.category,
        amount=tx.amount,
        description=tx.description,
        source=tx.source or "manual",
        account_display=displays.get(tx.bank_account_id) if tx.bank_account_id else None,
    )


def transactions_to_responses(db: Session, txs: List[Transaction]) -> List[TransactionResponse]:
    ids = list({t.bank_account_id for t in txs if t.bank_account_id})
    displays = account_display_map(db, ids)
    return [transaction_to_response(t, displays) for t in txs]


def _existing_dedupe_keys(db: Session) -> set:
    return {
        row[0]
        for row in db.query(Transaction.dedupe_key).filter(Transaction.dedupe_key.isnot(None)).all()
        if row[0]
    }


async def preview_bank_import(
    bank_slug: str, file: UploadFile, db: Session
) -> ImportPreviewResponse:
    cfg = get_bank_import(bank_slug)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown bank import type")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    lower = file.filename.lower()
    if not any(lower.endswith(ext) for ext in cfg.file_extensions):
        raise HTTPException(
            status_code=400,
            detail=f"Upload a file with extension: {', '.join(cfg.file_extensions)}",
        )
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    try:
        parsed = cfg.parse(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    existing_keys = _existing_dedupe_keys(db)
    seen_in_file: set[str] = set()
    preview_rows: List[ImportPreviewRow] = []
    new_count = duplicate_count = 0
    for row in parsed:
        display = f"{cfg.bank_name} ···{row.account_mask}"
        key = row.dedupe_key
        if key in existing_keys or key in seen_in_file:
            status = "duplicate"
            duplicate_count += 1
        else:
            status = "new"
            new_count += 1
            seen_in_file.add(key)
        preview_rows.append(
            ImportPreviewRow(
                dedupe_key=row.dedupe_key,
                date=row.date,
                account_mask=row.account_mask,
                account_display=display,
                description=row.description,
                category=row.category,
                amount=row.amount,
                status=status,
            )
        )

    summary = {
        "total_parsed": len(preview_rows),
        "new": new_count,
        "duplicate": duplicate_count,
    }
    logger.info(
        "import_preview bank=%s filename=%s total=%s new=%s duplicate=%s",
        bank_slug,
        file.filename,
        summary["total_parsed"],
        new_count,
        duplicate_count,
    )
    return ImportPreviewResponse(
        bank=cfg.name,
        filename=file.filename,
        rows=preview_rows,
        summary=summary,
    )


def commit_bank_import(
    bank_slug: str, body: ImportCommitRequest, db: Session
) -> ImportCommitResponse:
    logger.info(
        "import_commit_start bank=%s filename=%s rows=%s",
        bank_slug,
        body.filename,
        len(body.rows),
    )
    cfg = get_bank_import(bank_slug)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown bank import type")
    bank = get_or_create_bank(db, cfg.bank_slug, cfg.bank_name)
    batch = ImportBatch(bank_id=bank.id, filename=body.filename, rows_inserted=0)
    db.add(batch)
    db.flush()

    inserted = 0
    skipped = 0
    seen_keys: set[str] = set()
    for row in body.rows:
        expected = build_dedupe_key(
            cfg.bank_slug, row.account_mask, row.date, row.amount, row.description
        )
        if expected != row.dedupe_key:
            raise HTTPException(status_code=400, detail="Import row failed validation")
        dedupe_key = row.dedupe_key
        if dedupe_key in seen_keys:
            skipped += 1
            continue
        if db.query(Transaction).filter(Transaction.dedupe_key == dedupe_key).first():
            skipped += 1
            continue
        try:
            acc = get_or_create_bank_account(db, bank, row.account_mask)
            db_tx = Transaction(
                date=row.date,
                type=TransactionType.expense,
                category=row.category,
                amount=round(row.amount, 2),
                description=row.description,
                source="import",
                bank_account_id=acc.id,
                dedupe_key=dedupe_key,
                import_batch_id=batch.id,
            )
            with db.begin_nested():
                db.add(db_tx)
            inserted += 1
            seen_keys.add(dedupe_key)
        except IntegrityError:
            logger.info(
                "import_row_skipped reason=integrity_error bank=%s dedupe_key_prefix=%s",
                bank_slug,
                dedupe_key[:16],
            )
            skipped += 1
            continue
        except Exception as e:
            logger.warning(
                "import_row_skipped reason=error bank=%s dedupe_key_prefix=%s err=%s",
                bank_slug,
                dedupe_key[:16],
                e,
            )
            skipped += 1
            continue

    batch.rows_inserted = inserted
    db.commit()
    if inserted:
        record_net_worth_snapshot(db)
    logger.info(
        "import_commit_done bank=%s batch_id=%s inserted=%s skipped=%s filename=%s",
        bank_slug,
        batch.id,
        inserted,
        skipped,
        body.filename,
    )
    return ImportCommitResponse(inserted=inserted, skipped=skipped, batch_id=batch.id)