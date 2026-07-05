from datetime import UTC, datetime
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from import_parsers.dedupe import build_dedupe_key
from import_registry import get_bank_import, get_brokerage_import
from import_upload_limits import read_csv_bytes_limited
from logging_config import get_logger
from models import (
    Asset,
    Bank,
    BankAccount,
    Brokerage,
    BrokerageAccount,
    Holding,
    ImportBatch,
    Liability,
    Transaction,
    TransactionType,
)
from schemas import (
    AssetResponse,
    FidelityCommitRequest,
    FidelityCommitResponse,
    FidelityPreviewResponse,
    FidelityPreviewRow,
    HoldingResponse,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    ImportPreviewRow,
    LiabilityResponse,
    NetWorthResponse,
    TransactionResponse,
)
from services.market_data import market_data

logger = get_logger()


def compute_other_assets(db: Session, user_id: int) -> float:
    total = db.query(Asset).filter(Asset.user_id == user_id).with_entities(Asset.current_value).all()
    return round(sum(row[0] for row in total), 2)


def compute_liabilities(db: Session, user_id: int) -> float:
    total = db.query(Liability).filter(Liability.user_id == user_id).with_entities(Liability.balance_owed).all()
    return round(sum(row[0] for row in total), 2)


def compute_net_worth(db: Session, user_id: int) -> NetWorthResponse:
    other_assets = compute_other_assets(db, user_id)
    portfolio, sources, breakdown = compute_portfolio(db, user_id)
    liabilities = compute_liabilities(db, user_id)
    total_assets = round(other_assets + portfolio, 2)
    total = round(total_assets - liabilities, 2)
    return NetWorthResponse(
        other_assets=other_assets,
        portfolio=portfolio,
        liabilities=liabilities,
        total_assets=total_assets,
        total=total,
        as_of=datetime.now(UTC),
        portfolio_sources=sources,
        portfolio_breakdown=breakdown,
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
    h: Holding,
    force_refresh: bool = False,
    db: Optional[Session] = None,
    price_cache: Optional[Dict[str, Tuple[float, str, Optional[datetime]]]] = None,
) -> HoldingResponse:
    sym_key = h.symbol.upper().strip()
    if price_cache is not None:
        if sym_key not in price_cache or force_refresh:
            price_cache[sym_key] = market_data.get_price(
                h.symbol, force_refresh=force_refresh, db=db
            )
        current_price, source, as_of = price_cache[sym_key]
    else:
        current_price, source, as_of = market_data.get_price(
            h.symbol, force_refresh=force_refresh, db=db
        )
    if current_price <= 0 or source in ("error", "non_ticker"):
        current_price = h.purchase_price
        source = "fallback_purchase" if source != "non_ticker" else "non_ticker"
        as_of = None
    value = round(h.shares * current_price, 2)

    company_name = market_data.get_company_name(h.symbol) if source not in ("non_ticker",) else None

    account_display = None
    if h.brokerage_account_id and db is not None:
        displays = brokerage_account_display_map(db, h.user_id, [h.brokerage_account_id])
        account_display = displays.get(h.brokerage_account_id)

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
        account_display=account_display,
        company_name=company_name,
        brokerage_account_id=h.brokerage_account_id,
    )


def compute_portfolio(db: Session, user_id: int) -> Tuple[float, Dict[str, str], Dict[str, float]]:
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    total = 0.0
    sources: Dict[str, str] = {}
    breakdown: Dict[str, float] = {}
    displays = brokerage_account_display_map(db, user_id, [h.brokerage_account_id for h in holdings if h.brokerage_account_id])
    price_cache: Dict[str, Tuple[float, str, Optional[datetime]]] = {}
    for h in holdings:
        resp = holding_to_response(h, db=db, price_cache=price_cache)
        total += resp.value
        sources[h.symbol] = resp.price_source
        key = resp.account_display or "Manual / Unassigned"
        breakdown[key] = breakdown.get(key, 0.0) + resp.value
    return round(total, 2), sources, {k: round(v, 2) for k, v in breakdown.items()}


def get_or_create_bank(db: Session, slug: str, name: str) -> Bank:
    bank = db.query(Bank).filter(Bank.slug == slug).first()
    if bank:
        return bank
    bank = Bank(slug=slug, name=name)
    db.add(bank)
    db.flush()
    db.refresh(bank)
    return bank


def get_or_create_bank_account(db: Session, user_id: int, bank: Bank, account_mask: str) -> BankAccount:
    acc = (
        db.query(BankAccount)
        .filter(BankAccount.user_id == user_id, BankAccount.bank_id == bank.id, BankAccount.account_mask == account_mask)
        .first()
    )
    if acc:
        return acc
    label = f"{bank.name} ···{account_mask}"
    acc = BankAccount(
        user_id=user_id,
        bank_id=bank.id,
        account_mask=account_mask,
        label=label,
        account_type="credit_card",
    )
    db.add(acc)
    db.flush()
    db.refresh(acc)
    return acc


def account_display_map(db: Session, user_id: int, account_ids: List[int]) -> Dict[int, str]:
    if not account_ids:
        return {}
    rows = (
        db.query(BankAccount, Bank)
        .join(Bank, Bank.id == BankAccount.bank_id)
        .filter(BankAccount.user_id == user_id, BankAccount.id.in_(account_ids))
        .all()
    )
    out: Dict[int, str] = {}
    for acc, bank in rows:
        out[acc.id] = acc.label or f"{bank.name} ···{acc.account_mask}"
    return out


def brokerage_account_display(acc: BrokerageAccount, br: Brokerage) -> str:
    """Return display name, preferring nickname > label > default."""
    if acc.nickname:
        return acc.nickname
    if acc.label:
        return acc.label
    return f"{br.name} ···{acc.account_mask}" if br else f"···{acc.account_mask}"


def get_or_create_brokerage(db: Session, slug: str, name: str) -> Brokerage:
    br = db.query(Brokerage).filter(Brokerage.slug == slug).first()
    if br:
        return br
    br = Brokerage(slug=slug, name=name)
    db.add(br)
    db.flush()
    db.refresh(br)
    return br


def get_or_create_brokerage_account(db: Session, user_id: int, br: Brokerage, account_mask: str, account_name: str = "") -> BrokerageAccount:
    acc = (
        db.query(BrokerageAccount)
        .filter(BrokerageAccount.user_id == user_id, BrokerageAccount.brokerage_id == br.id, BrokerageAccount.account_mask == account_mask)
        .first()
    )
    if acc:
        return acc
    label = f"{br.name} ···{account_mask}"
    if account_name:
        label = f"{br.name} ···{account_mask} ({account_name})"
    acc = BrokerageAccount(
        user_id=user_id,
        brokerage_id=br.id,
        account_mask=account_mask,
        label=label,
    )
    db.add(acc)
    db.flush()
    db.refresh(acc)
    return acc


def set_brokerage_account_nickname(db: Session, user_id: int, brokerage_account_id: int, nickname: str) -> BrokerageAccount:
    acc = db.query(BrokerageAccount).filter(BrokerageAccount.id == brokerage_account_id, BrokerageAccount.user_id == user_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Brokerage account not found")
    acc.nickname = nickname.strip() or None
    db.commit()
    db.refresh(acc)
    return acc


def brokerage_account_display_map(db: Session, user_id: int, account_ids: List[int]) -> Dict[int, str]:
    if not account_ids:
        return {}
    rows = (
        db.query(BrokerageAccount, Brokerage)
        .join(Brokerage, Brokerage.id == BrokerageAccount.brokerage_id)
        .filter(BrokerageAccount.user_id == user_id, BrokerageAccount.id.in_(account_ids))
        .all()
    )
    out: Dict[int, str] = {}
    for acc, br in rows:
        out[acc.id] = brokerage_account_display(acc, br)
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


def transactions_to_responses(db: Session, user_id: int, txs: List[Transaction]) -> List[TransactionResponse]:
    ids = list({t.bank_account_id for t in txs if t.bank_account_id})
    displays = account_display_map(db, user_id, ids)
    return [transaction_to_response(t, displays) for t in txs]


def _existing_dedupe_keys(db: Session, user_id: int) -> set:
    return {
        row[0]
        for row in db.query(Transaction.dedupe_key).filter(Transaction.user_id == user_id, Transaction.dedupe_key.isnot(None)).all()
        if row[0]
    }


async def preview_bank_import(
    bank_slug: str, file: UploadFile, db: Session, user_id: int
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
    raw_bytes = await read_csv_bytes_limited(file)
    raw = raw_bytes.decode("utf-8-sig", errors="replace")
    try:
        parsed = cfg.parse(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"{cfg.name} import failed: {e}") from e

    existing_keys = _existing_dedupe_keys(db, user_id)
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
    bank_slug: str, body: ImportCommitRequest, db: Session, user_id: int
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
    batch = ImportBatch(user_id=user_id, bank_id=bank.id, filename=body.filename, rows_inserted=0)
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
        if db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.dedupe_key == dedupe_key).first():
            skipped += 1
            continue
        try:
            acc = get_or_create_bank_account(db, user_id, bank, row.account_mask)
            db_tx = Transaction(
                user_id=user_id,
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


# Fidelity / brokerage holdings import (replace semantics per account)

async def preview_fidelity_import(
    file: UploadFile, db: Session
) -> FidelityPreviewResponse:
    cfg = get_brokerage_import("fidelity")
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown brokerage import type")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    lower = file.filename.lower()
    if not any(lower.endswith(ext) for ext in cfg.file_extensions):
        raise HTTPException(
            status_code=400,
            detail=f"Upload a file with extension: {', '.join(cfg.file_extensions)}",
        )
    raw_bytes = await read_csv_bytes_limited(file)
    raw = raw_bytes.decode("utf-8-sig", errors="replace")
    try:
        parsed = cfg.parse(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Group by account for replace preview
    from collections import defaultdict
    by_account: dict[str, list] = defaultdict(list)
    for row in parsed:
        by_account[row.account_mask].append(row)

    preview_rows: list[FidelityPreviewRow] = []
    accounts_seen: list[str] = []
    total_cost = 0.0
    for mask, rows in by_account.items():
        display = f"Fidelity ···{mask}"
        accounts_seen.append(display)
        for r in rows:
            preview_rows.append(
                FidelityPreviewRow(
                    account_mask=mask,
                    account_display=display,
                    symbol=r.symbol,
                    shares=r.shares,
                    avg_cost_basis=r.avg_cost_basis,
                    cost_basis_total=r.cost_basis_total,
                    status="replace",
                )
            )
            total_cost += r.cost_basis_total

    summary = {
        "accounts": len(by_account),
        "positions": len(parsed),
        "total_cost": round(total_cost, 2),
    }
    logger.info(
        "fidelity_preview filename=%s accounts=%s positions=%s",
        file.filename,
        summary["accounts"],
        summary["positions"],
    )
    return FidelityPreviewResponse(
        broker=cfg.name,
        filename=file.filename,
        accounts=accounts_seen,
        rows=preview_rows,
        summary=summary,
    )


def commit_fidelity_import(
    body: FidelityCommitRequest, db: Session, user_id: int
) -> FidelityCommitResponse:
    cfg = get_brokerage_import("fidelity")
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown brokerage import type")

    logger.info(
        "fidelity_commit_start filename=%s rows=%s",
        body.filename,
        len(body.rows),
    )

    br = get_or_create_brokerage(db, cfg.slug, cfg.name)

    # Collect unique accounts from the commit payload
    accounts_in_file: dict[str, str] = {}  # mask -> name (name may be empty)
    for r in body.rows:
        if r.account_mask not in accounts_in_file:
            accounts_in_file[r.account_mask] = ""

    holdings_replaced = 0
    inserted = 0
    account_displays: list[str] = []

    acc_map: dict[str, BrokerageAccount] = {}
    for mask in accounts_in_file:
        acc = get_or_create_brokerage_account(db, user_id, br, mask)
        acc_map[mask] = acc
        # Replace: delete existing holdings for this account
        deleted = db.query(Holding).filter(Holding.user_id == user_id, Holding.brokerage_account_id == acc.id).delete()
        holdings_replaced += deleted
        account_displays.append(acc.label or f"{br.name} ···{mask}")

    for r in body.rows:
        acc = acc_map[r.account_mask]
        h = Holding(
            user_id=user_id,
            symbol=r.symbol.upper().strip(),
            shares=round(r.shares, 6),
            purchase_price=round(r.avg_cost_basis or 0.0, 4),
            purchase_date=date.today(),
            brokerage_account_id=acc.id,
        )
        db.add(h)
        inserted += 1

    db.commit()
    logger.info(
        "fidelity_commit_done replaced_accounts=%s holdings_replaced=%s inserted=%s",
        len(accounts_in_file),
        holdings_replaced,
        inserted,
    )
    return FidelityCommitResponse(
        accounts_replaced=len(accounts_in_file),
        holdings_replaced=holdings_replaced,
        inserted=inserted,
        accounts=account_displays,
    )
