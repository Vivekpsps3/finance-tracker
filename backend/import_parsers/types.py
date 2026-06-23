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