"""Registered bank statement importers (dropdown + routing)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List

from import_parsers.capital_one import (
    BANK_NAME as CAPITAL_ONE_NAME,
    BANK_SLUG as CAPITAL_ONE_SLUG,
    IMPORT_HINT as CAPITAL_ONE_HINT,
    parse_capital_one_csv,
)
from import_parsers.types import ParsedImportRow


@dataclass(frozen=True)
class BankImportConfig:
    slug: str
    name: str
    hint: str
    file_extensions: tuple[str, ...]
    parse: Callable[[str], List[ParsedImportRow]]
    bank_slug: str
    bank_name: str


BANK_IMPORTS: Dict[str, BankImportConfig] = {
    CAPITAL_ONE_SLUG: BankImportConfig(
        slug=CAPITAL_ONE_SLUG,
        name=CAPITAL_ONE_NAME,
        hint=CAPITAL_ONE_HINT,
        file_extensions=(".csv",),
        parse=parse_capital_one_csv,
        bank_slug=CAPITAL_ONE_SLUG,
        bank_name=CAPITAL_ONE_NAME,
    ),
}


def list_bank_imports() -> List[dict]:
    return [
        {
            "slug": cfg.slug,
            "name": cfg.name,
            "hint": cfg.hint,
            "file_extensions": list(cfg.file_extensions),
        }
        for cfg in BANK_IMPORTS.values()
    ]


SLUG_ALIASES = {
    "capital-one": CAPITAL_ONE_SLUG,
}


def get_bank_import(slug: str) -> BankImportConfig | None:
    canonical = SLUG_ALIASES.get(slug, slug)
    return BANK_IMPORTS.get(canonical)
