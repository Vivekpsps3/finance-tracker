"""American Express credit card CSV export."""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from typing import List

from import_parsers.categories import resolve_transaction_category
from import_parsers.dedupe import build_dedupe_key, normalize_description
from import_parsers.types import ParsedImportRow

BANK_SLUG = "amex"
BANK_NAME = "American Express"
IMPORT_HINT = (
    "American Express credit card CSV. Uses Date, Description, Account #, Amount, and optional Category. "
    "Positive amounts are imported as expenses; credits are skipped."
)

REQUIRED_HEADERS = {
    "date",
    "description",
    "account #",
    "amount",
}


def _parse_date(raw: str) -> date:
    raw = (raw or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date: {raw!r}")


def _parse_amount(raw: str) -> float:
    raw = (raw or "").strip().replace(",", "").replace("$", "")
    if not raw:
        return 0.0
    if raw.startswith("(") and raw.endswith(")"):
        raw = f"-{raw[1:-1]}"
    return round(float(raw), 2)


def _normalize_header_row(row: List[str]) -> List[str]:
    return [h.strip().lower() for h in row]


def _normalize_account_mask(raw: str) -> str:
    return (raw or "").strip().lstrip("-") or "amex"


def parse_amex_csv(content: str) -> List[ParsedImportRow]:
    text = content.lstrip("\ufeff")
    reader = csv.reader(io.StringIO(text))
    try:
        header = _normalize_header_row(next(reader))
    except StopIteration:
        raise ValueError("CSV file is empty")

    header_set = set(header)
    missing = REQUIRED_HEADERS - header_set
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")

    idx = {name: header.index(name) for name in header}
    category_idx = idx.get("category")

    rows: List[ParsedImportRow] = []
    for line_no, row in enumerate(reader, start=2):
        if not row or all(not cell.strip() for cell in row):
            continue
        if len(row) < len(header):
            row = row + [""] * (len(header) - len(row))

        amount = _parse_amount(row[idx["amount"]])
        if amount <= 0:
            continue

        try:
            tx_date = _parse_date(row[idx["date"]])
        except ValueError as e:
            raise ValueError(f"Line {line_no}: {e}") from e

        account_mask = _normalize_account_mask(row[idx["account #"]])
        description = normalize_description(row[idx["description"]])
        bank_category = row[category_idx].strip() if category_idx is not None else ""
        category = resolve_transaction_category(description, bank_category or None)

        dedupe_key = build_dedupe_key(BANK_SLUG, account_mask, tx_date, amount, description)
        rows.append(
            ParsedImportRow(
                date=tx_date,
                account_mask=account_mask,
                description=description,
                category=category,
                amount=amount,
                dedupe_key=dedupe_key,
            )
        )

    return rows
