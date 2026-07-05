"""Shared merchant → transaction category rules (imports and manual entry)."""

from __future__ import annotations

CATEGORY_COSTCO = "Costco"


def _mentions_costco(*parts: str) -> bool:
    return any("costco" in (part or "").lower() for part in parts)


def resolve_transaction_category(description: str, bank_category: str | None = None) -> str:
    if _mentions_costco(description, bank_category):
        return CATEGORY_COSTCO
    cat = (bank_category or "").strip()
    return cat or "Uncategorized"