"""Chase credit card CSV export (sale rows only)."""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from typing import List

from import_parsers.categories import resolve_transaction_category
from import_parsers.dedupe import build_dedupe_key, normalize_description
from import_parsers.types import ParsedImportRow

BANK_SLUG = "chase"
BANK_NAME = "Chase"
IMPORT_HINT = (
    "Chase credit card CSV. Uses Transaction Date, Description, Category, Type, and Amount. "
    "Negative Sale rows are imported as expenses; payments are skipped."
)

ACCOUNT_MASK = "chase"

REQUIRED_HEADERS = {
    "transaction date",
    "post date",
    "description",
    "category",
    "type",
    "amount",
    "memo",
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


def parse_chase_csv(content: str) -> List[ParsedImportRow]:
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

    rows: List[ParsedImportRow] = []
    for line_no, row in enumerate(reader, start=2):
        if not row or all(not cell.strip() for cell in row):
            continue
        if len(row) < len(header):
            row = row + [""] * (len(header) - len(row))

        row_type = row[idx["type"]].strip().lower()
        amount_raw = _parse_amount(row[idx["amount"]])
        if row_type != "sale" or amount_raw >= 0:
            continue

        try:
            tx_date = _parse_date(row[idx["transaction date"]])
        except ValueError as e:
            raise ValueError(f"Line {line_no}: {e}") from e

        description = normalize_description(row[idx["description"]])
        category = resolve_transaction_category(description, row[idx["category"]].strip() or None)
        amount = abs(amount_raw)

        dedupe_key = build_dedupe_key(BANK_SLUG, ACCOUNT_MASK, tx_date, amount, description)
        rows.append(
            ParsedImportRow(
                date=tx_date,
                account_mask=ACCOUNT_MASK,
                description=description,
                category=category,
                amount=amount,
                dedupe_key=dedupe_key,
            )
        )

    return rows
