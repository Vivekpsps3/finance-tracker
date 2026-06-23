"""Capital One credit card CSV export (debit rows only)."""

from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from typing import List

from import_parsers.dedupe import build_dedupe_key, normalize_description
from import_parsers.types import ParsedImportRow

BANK_SLUG = "capital_one"
BANK_NAME = "Capital One"
IMPORT_HINT = (
    "Capital One credit card CSV. Uses Transaction Date, Card No., Description, Category, and Debit. "
    "Credits are skipped."
)

REQUIRED_HEADERS = {
    "transaction date",
    "card no.",
    "description",
    "category",
    "debit",
    "credit",
}


def _parse_date(raw: str) -> date:
    raw = (raw or "").strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date: {raw!r}")


def _parse_amount(raw: str) -> float:
    raw = (raw or "").strip().replace(",", "").replace("$", "")
    if not raw:
        return 0.0
    return round(float(raw), 2)


def _normalize_header_row(row: List[str]) -> List[str]:
    return [h.strip().lower() for h in row]


def parse_capital_one_csv(content: str) -> List[ParsedImportRow]:
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

        debit = _parse_amount(row[idx["debit"]])
        credit = _parse_amount(row[idx["credit"]])
        if debit <= 0 and credit > 0:
            continue
        if debit <= 0:
            continue

        try:
            tx_date = _parse_date(row[idx["transaction date"]])
        except ValueError as e:
            raise ValueError(f"Line {line_no}: {e}") from e

        account_mask = row[idx["card no."]].strip()
        description = normalize_description(row[idx["description"]])
        category = row[idx["category"]].strip() or "Uncategorized"
        amount = debit

        if not account_mask:
            raise ValueError(f"Line {line_no}: missing card number")

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