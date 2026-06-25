"""Fidelity positions CSV export parser for portfolio holdings import.

Focus: current positions (Symbol, Quantity=shares, Average Cost Basis).
Ignores today's prices/gains (per spec). Supports multiple accounts.
Resets/replaces on commit for accounts present in the file.

Modeled exactly after capital_one.py for consistency and dedup of parser structure.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from typing import List

from import_parsers.types import ParsedFidelityRow  # will add if not present

BANK_SLUG = "fidelity"
BANK_NAME = "Fidelity"
IMPORT_HINT = (
    "Fidelity positions CSV (Account Number, Account Name, Symbol, Quantity, "
    "Average Cost Basis, etc). Upload exports current holdings per account. "
    "Import will REPLACE existing positions for the Fidelity accounts found in the file. "
    "Today's gain/loss and current prices in CSV are ignored (live prices used after import)."
)

REQUIRED_HEADERS = {
    "account number",
    "account name",
    "symbol",
    "quantity",
    "average cost basis",
}


def _normalize_header_row(row: List[str]) -> List[str]:
    return [h.strip().lower() for h in row]


def _parse_float(raw: str) -> float:
    raw = (raw or "").strip().replace(",", "").replace("$", "")
    if not raw:
        return 0.0
    try:
        return round(float(raw), 4)
    except ValueError:
        return 0.0


def parse_fidelity_csv(content: str) -> List[ParsedFidelityRow]:
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

    rows: List[ParsedFidelityRow] = []
    for line_no, row in enumerate(reader, start=2):
        if not row or all(not cell.strip() for cell in row):
            continue
        if len(row) < len(header):
            row = row + [""] * (len(header) - len(row))

        try:
            account_mask = row[idx["account number"]].strip()
            account_name = row[idx["account name"]].strip() if "account name" in idx else ""
            symbol_raw = row[idx["symbol"]].strip().upper().replace("**", "")  # SPAXX** -> SPAXX
            shares = _parse_float(row[idx["quantity"]])
            avg_cost = _parse_float(row[idx["average cost basis"]])
        except (KeyError, IndexError) as e:
            raise ValueError(f"Line {line_no}: malformed row - {e}") from e

        if not account_mask or shares <= 0:
            continue  # skip cash-like or invalid

        # cost_basis_total can be derived but we store avg
        rows.append(
            ParsedFidelityRow(
                account_mask=account_mask,
                account_name=account_name or account_mask,
                symbol=symbol_raw,
                shares=shares,
                avg_cost_basis=avg_cost if avg_cost > 0 else 0.0,
                cost_basis_total=round(shares * (avg_cost if avg_cost > 0 else 0.0), 2),
            )
        )

    return rows
