"""Unit tests for MarketDataService (no live yfinance)."""

from datetime import date, datetime

import pytest
from sqlalchemy import delete

from models import Base, MarketResearchCache, TickerQuote
from services.market_data import MarketDataService
from schemas_market import MarketResearchResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def svc():
    return MarketDataService(ttl_seconds=3600)


def test_non_ticker_returns_zero(svc):
    price, source, ts = svc.get_price("123456789012", force_refresh=False)
    assert price == 0.0
    assert source == "non_ticker"
    assert ts is None


def test_memory_cache_hit(svc, monkeypatch):
    monkeypatch.setattr(svc, "_looks_like_non_ticker", lambda _s: False)
    monkeypatch.setattr(svc, "_fetch_eod", lambda _s: (42.5, date.today(), "live_eod"))
    monkeypatch.setattr("services.market_data.get_redis_eod", lambda _s: None)
    monkeypatch.setattr("services.market_data.set_redis_eod", lambda *a, **k: None)

    p1, src1, _ = svc.get_price("AAPL", force_refresh=True, db=None)
    assert p1 == 42.5
    assert src1 == "live_eod"

    calls = {"n": 0}

    def counting_fetch(_symbol):
        calls["n"] += 1
        return (99.0, date.today(), "live_eod")

    monkeypatch.setattr(svc, "_fetch_eod", counting_fetch)
    p2, _, _ = svc.get_price("AAPL", force_refresh=False, db=None)
    assert p2 == 42.5
    assert calls["n"] == 0


def test_failed_symbol_backoff(svc, monkeypatch):
    monkeypatch.setattr(svc, "_looks_like_non_ticker", lambda _s: False)
    monkeypatch.setattr(svc, "_fetch_eod", lambda _s: (None, None, "error"))
    monkeypatch.setattr("services.market_data.get_redis_eod", lambda _s: None)

    p1, src1, _ = svc.get_price("FAIL", force_refresh=True, db=None)
    assert p1 == 0.0
    assert src1 == "error"

    monkeypatch.setattr(
        svc,
        "_fetch_eod",
        lambda _s: (_ for _ in ()).throw(AssertionError("should not fetch")),
    )
    p2, src2, _ = svc.get_price("FAIL", force_refresh=False, db=None)
    assert p2 == 0.0
    assert src2 == "error"


def test_fetch_eod_mocked_returns_price(svc, monkeypatch):
    monkeypatch.setattr(svc, "_looks_like_non_ticker", lambda _s: False)

    def fake_eod(symbol):
        assert symbol == "MSFT"
        return 300.0, date(2026, 1, 15), "live_eod"

    monkeypatch.setattr(svc, "_fetch_eod", fake_eod)
    monkeypatch.setattr("services.market_data.get_redis_eod", lambda _s: None)
    monkeypatch.setattr("services.market_data.set_redis_eod", lambda *a, **k: None)

    price, source, _ = svc.get_price("MSFT", force_refresh=True, db=None)
    assert price == 300.0
    assert source == "live_eod"


def test_sqlite_naive_fetched_at_does_not_crash(svc):
    """Legacy ticker_quotes rows may store naive UTC fetched_at (pre-BE-015)."""
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    Session = sessionmaker(bind=eng)
    session = Session()
    try:
        session.add(
            TickerQuote(
                symbol="AAPL",
                close_price=100.0,
                quote_date=date.today(),
                fetched_at=datetime.utcnow(),
                source="sqlite_eod",
            )
        )
        session.commit()
        price, source, ts = svc.get_price("AAPL", force_refresh=False, db=session)
        assert price == 100.0
        assert source == "sqlite_eod"
        assert ts is not None
    finally:
        session.close()


def test_research_cache_cold_insert_uses_winning_row_after_savepoint_collision(svc):
    """A duplicate cache insert must not roll back the surrounding request transaction."""
    from sqlalchemy.exc import IntegrityError

    class Savepoint:
        rolled_back = False

        def rollback(self):
            self.rolled_back = True

        def commit(self):
            raise AssertionError("a conflicting insert must not commit its savepoint")

    class Query:
        def filter(self, *_args):
            return self

        def first(self):
            query_calls.append(1)
            return None if len(query_calls) == 1 else winner

    class Session:
        rolled_back = False

        def begin_nested(self):
            return savepoint

        def query(self, _model):
            return Query()

        def add(self, _row):
            pass

        def flush(self):
            raise IntegrityError("insert", {}, Exception("duplicate key"))

        def rollback(self):
            self.rolled_back = True

    now = datetime.utcnow()
    winner = MarketResearchCache(
        symbol="VOO", period="10y", payload_json="{}", source="yfinance",
        fetched_at=now, expires_at=now,
    )
    savepoint = Savepoint()
    query_calls = []
    response = MarketResearchResponse(
        symbol="VOO", valid=True, source="yfinance", fetched_at=now,
        cache_status="miss", warnings=[], profile={}, quote={}, history=[], dividends=[], splits=[],
    )

    svc._research_cache_set(Session(), "VOO", "10y", response)

    assert savepoint.rolled_back
    assert len(query_calls) == 2
