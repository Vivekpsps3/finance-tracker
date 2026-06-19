"""Stable dedupe keys for bank import rows (shared across parsers)."""

from __future__ import annotations

import hashlib
import re
from datetime import date


def normalize_description(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def build_dedupe_key(bank_slug: str, account_mask: str, tx_date: date, amount: float, description: str) -> str:
    payload = "|".join(
        [
            bank_slug,
            account_mask.strip(),
            tx_date.isoformat(),
            f"{amount:.2f}",
            normalize_description(description).lower(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()