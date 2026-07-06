"""Registered bank statement importers (dropdown + routing)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List

from import_parsers.amex import (
    BANK_NAME as AMEX_NAME,
    BANK_SLUG as AMEX_SLUG,
    IMPORT_HINT as AMEX_HINT,
    parse_amex_csv,
)
from import_parsers.capital_one import (
    BANK_NAME as CAPITAL_ONE_NAME,
    BANK_SLUG as CAPITAL_ONE_SLUG,
    IMPORT_HINT as CAPITAL_ONE_HINT,
    parse_capital_one_csv,
)
from import_parsers.chase import (
    BANK_NAME as CHASE_NAME,
    BANK_SLUG as CHASE_SLUG,
    IMPORT_HINT as CHASE_HINT,
    parse_chase_csv,
)
from import_parsers.citi import (
    BANK_NAME as CITI_NAME,
    BANK_SLUG as CITI_SLUG,
    IMPORT_HINT as CITI_HINT,
    parse_citi_csv,
)
from import_parsers.fidelity import (
    BANK_NAME as FIDELITY_NAME,
    BANK_SLUG as FIDELITY_SLUG,
    IMPORT_HINT as FIDELITY_HINT,
    parse_fidelity_csv,
)
from import_parsers.x_money import (
    BANK_NAME as X_MONEY_NAME,
    BANK_SLUG as X_MONEY_SLUG,
    IMPORT_HINT as X_MONEY_HINT,
    parse_x_money_csv,
)
from import_parsers.types import ParsedFidelityRow, ParsedImportRow


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
    CHASE_SLUG: BankImportConfig(
        slug=CHASE_SLUG,
        name=CHASE_NAME,
        hint=CHASE_HINT,
        file_extensions=(".csv",),
        parse=parse_chase_csv,
        bank_slug=CHASE_SLUG,
        bank_name=CHASE_NAME,
    ),
    AMEX_SLUG: BankImportConfig(
        slug=AMEX_SLUG,
        name=AMEX_NAME,
        hint=AMEX_HINT,
        file_extensions=(".csv",),
        parse=parse_amex_csv,
        bank_slug=AMEX_SLUG,
        bank_name=AMEX_NAME,
    ),
    CITI_SLUG: BankImportConfig(
        slug=CITI_SLUG,
        name=CITI_NAME,
        hint=CITI_HINT,
        file_extensions=(".csv",),
        parse=parse_citi_csv,
        bank_slug=CITI_SLUG,
        bank_name=CITI_NAME,
    ),
    X_MONEY_SLUG: BankImportConfig(
        slug=X_MONEY_SLUG,
        name=X_MONEY_NAME,
        hint=X_MONEY_HINT,
        file_extensions=(".csv",),
        parse=parse_x_money_csv,
        bank_slug=X_MONEY_SLUG,
        bank_name=X_MONEY_NAME,
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
    "american-express": AMEX_SLUG,
    "capital-one": CAPITAL_ONE_SLUG,
    "chase-bank": CHASE_SLUG,
    "citi-bank": CITI_SLUG,
    "x-money": X_MONEY_SLUG,
}


def get_bank_import(slug: str) -> BankImportConfig | None:
    canonical = SLUG_ALIASES.get(slug, slug)
    return BANK_IMPORTS.get(canonical)


# Parallel structure for portfolio / brokerage (holdings) imports.
# Separate for type safety (tx dedupe vs holdings replace).

@dataclass(frozen=True)
class BrokerageImportConfig:
    slug: str
    name: str
    hint: str
    file_extensions: tuple[str, ...]
    parse: Callable[[str], List[ParsedFidelityRow]]


BROKERAGE_IMPORTS: Dict[str, BrokerageImportConfig] = {
    FIDELITY_SLUG: BrokerageImportConfig(
        slug=FIDELITY_SLUG,
        name=FIDELITY_NAME,
        hint=FIDELITY_HINT,
        file_extensions=(".csv",),
        parse=parse_fidelity_csv,
    ),
}


def list_brokerage_imports() -> List[dict]:
    return [
        {
            "slug": cfg.slug,
            "name": cfg.name,
            "hint": cfg.hint,
            "file_extensions": list(cfg.file_extensions),
        }
        for cfg in BROKERAGE_IMPORTS.values()
    ]


BROKERAGE_SLUG_ALIASES = {
    "fidelity-investments": FIDELITY_SLUG,
}


def get_brokerage_import(slug: str) -> BrokerageImportConfig | None:
    canonical = BROKERAGE_SLUG_ALIASES.get(slug, slug)
    return BROKERAGE_IMPORTS.get(canonical)
