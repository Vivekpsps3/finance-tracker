from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass
class ParsedImportRow:
    date: date
    account_mask: str
    description: str
    category: str
    amount: float
    dedupe_key: str


@dataclass
class ParsedFidelityRow:
    """Row from Fidelity positions CSV (for holdings replace import)."""
    account_mask: str
    account_name: str
    symbol: str
    shares: float
    avg_cost_basis: float
    cost_basis_total: float