from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from import_parsers.dedupe import build_dedupe_key
from import_registry import get_bank_import
from logging_config import get_logger
from models import (
    Asset,
    Bank,
    BankAccount,
    Holding,
    ImportBatch,
    Liability,
    NetWorthSnapshot,
    Transaction,
    TransactionType,
)
from schemas import (
    AssetResponse,
    HoldingResponse,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    ImportPreviewRow,
    LiabilityResponse,
    NetWorthHistoryPoint,
    NetWorthResponse,
    TransactionResponse,
)
from services.market_data import market_data

logger = get_logger()


def compute_other_assets(db: Session) -> float:
    total = db.query(Asset).with_entities(Asset.current_value).all()
    return round(sum(row[0] for row in total), 2)


def compute_liabilities(db: Session) -> float:
    total = db.query(Liability).with_entities(Liability.balance_owed).all()
    return round(sum(row[0] for row in total), 2)


def compute_net_worth(db: Session) -> NetWorthResponse:
    other_assets = compute_other_assets(db)
    portfolio, sources = compute_portfolio(db)
    liabilities = compute_liabilities(db)
    total_assets = round(other_assets + portfolio, 2)
    total = round(total_assets - liabilities, 2)
    return NetWorthResponse(
        other_assets=other_assets,
        portfolio=portfolio,
        liabilities=liabilities,
        total_assets=total_assets,
        total=total,
        as_of=datetime.utcnow(),
        portfolio_sources=sources,
    )


def asset_to_response(asset: Asset) -> AssetResponse:
    cat = asset.category.value if hasattr(asset.category, "value") else str(asset.category)
    return AssetResponse(
        id=asset.id,
        name=asset.name,
        category=cat,
        current_value=round(asset.current_value, 2),
        as_of_date=asset.as_of_date,
        notes=asset.notes,
        created_at=asset.created_at,
        updated_at=asset.updated_at or asset.created_at,
    )


def liability_to_response(liability: Liability) -> LiabilityResponse:
    cat = (
        liability.category.value
        if hasattr(liability.category, "value")
        else str(liability.category)
    )
    return LiabilityResponse(
        id=liability.id,
        name=liability.name,
        category=cat,
        balance_owed=round(liability.balance_owed, 2),
        as_of_date=liability.as_of_date,
        notes=liability.notes,
        created_at=liability.created_at,
        updated_at=liability.updated_at or liability.created_at,
    )


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


def _snapshot_to_history_point(snap: NetWorthSnapshot) -> NetWorthHistoryPoint:
    other_assets = snap.other_assets if snap.other_assets is not None else (snap.cash or 0.0)
    liabilities = snap.liabilities if snap.liabilities is not None else 0.0
    portfolio = snap.portfolio or 0.0
    total_assets = round(other_assets + portfolio, 2)
    return NetWorthHistoryPoint(
        date=snap.recorded_at.date().isoformat(),
        other_assets=round(other_assets, 2),
        portfolio=round(portfolio, 2),
        liabilities=round(liabilities, 2),
        total_assets=total_assets,
        total=round(snap.total, 2) if snap.total is not None else round(total_assets - liabilities, 2),
    )


def build_net_worth_history(db: Session) -> List[NetWorthHistoryPoint]:
    snaps = (
        db.query(NetWorthSnapshot)
        .order_by(NetWorthSnapshot.recorded_at.asc(), NetWorthSnapshot.id.asc())
        .all()
    )
    if snaps:
        points = [_snapshot_to_history_point(s) for s in snaps]
        points.reverse()
        return points

    current = compute_net_worth(db)
    today_iso = date.today().isoformat()
    return [
        NetWorthHistoryPoint(
            date=today_iso,
            other_assets=current.other_assets,
            portfolio=current.portfolio,
            liabilities=current.liabilities,
            total_assets=current.total_assets,
            total=current.total,
        )
    ]


def record_net_worth_snapshot(db: Session) -> None:
    current = compute_net_worth(db)
    snap = NetWorthSnapshot(
        cash=current.other_assets,
        other_assets=current.other_assets,
        portfolio=current.portfolio,
        liabilities=current.liabilities,
        total=current.total,
    )
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
    logger.info(
        "import_commit_done bank=%s batch_id=%s inserted=%s skipped=%s filename=%s",
        bank_slug,
        batch.id,
        inserted,
        skipped,
        body.filename,
    )
    return ImportCommitResponse(inserted=inserted, skipped=skipped, batch_id=batch.id)