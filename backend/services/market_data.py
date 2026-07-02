import os
import time
from datetime import UTC, date, datetime, timedelta
from typing import Dict, Optional, Tuple

import yfinance as yf
from sqlalchemy.orm import Session

from logging_config import get_logger
from models import TickerQuote
from price_cache import get_redis_eod, set_redis_eod

logger = get_logger()


def _ensure_utc(dt: datetime) -> datetime:
    """Normalize DB/memory datetimes for comparison (legacy rows may be naive UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


class MarketDataService:
    """In-memory hot cache + Redis/SQLite EOD close + yfinance on miss.

    Skips yfinance entirely for obvious non-tickers (CUSIPs, long codes, cash sweeps)
    to avoid log spam and useless API calls. Falls back to purchase_price.
    """

    def __init__(self, ttl_seconds: int = 120):
        self._memory: Dict[str, Tuple[float, datetime, str]] = {}
        self._ttl = timedelta(seconds=ttl_seconds)
        self._eod_ttl = timedelta(hours=int(os.getenv("EOD_CACHE_HOURS", "24")))
        # Remember symbols that failed to fetch so we don't hammer yfinance on every load
        self._failed: Dict[str, datetime] = {}

    def invalidate(self, symbol: str) -> None:
        sym = symbol.upper().strip()
        self._memory.pop(sym, None)
        self._failed.pop(sym, None)

    def clear_memory_cache(self) -> None:
        self._memory.clear()
        self._failed.clear()

    def _looks_like_non_ticker(self, symbol: str) -> bool:
        """Heuristic for symbols that are unlikely to be Yahoo Finance tickers."""
        if not symbol:
            return True
        if symbol[0].isdigit():
            return True
        if len(symbol) > 8:
            return True
        if symbol.startswith("SPAXX"):
            return True
        return False

    def _sqlite_get(self, db: Session, symbol: str) -> Optional[Tuple[float, datetime, str]]:
        row = db.query(TickerQuote).filter(TickerQuote.symbol == symbol).first()
        if not row:
            return None
        fetched_at = _ensure_utc(row.fetched_at)
        if datetime.now(UTC) - fetched_at > self._eod_ttl:
            return None
        return row.close_price, fetched_at, row.source or "sqlite_eod"

    def _sqlite_set(
        self, db: Session, symbol: str, close_price: float, quote_date: date, source: str
    ) -> None:
        now = datetime.now(UTC)
        row = db.query(TickerQuote).filter(TickerQuote.symbol == symbol).first()
        if row:
            row.close_price = close_price
            row.quote_date = quote_date
            row.fetched_at = now
            row.source = source
        else:
            db.add(
                TickerQuote(
                    symbol=symbol,
                    close_price=close_price,
                    quote_date=quote_date,
                    fetched_at=now,
                    source=source,
                )
            )
        db.flush()

    def _fetch_eod(self, symbol: str) -> Tuple[Optional[float], Optional[date], str]:
        started = time.perf_counter()
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="5d")
            if hist is not None and not hist.empty:
                close = float(hist["Close"].iloc[-1])
                idx = hist.index[-1]
                qd = idx.date() if hasattr(idx, "date") else date.today()
                logger.info(
                    "yfinance eod symbol=%s close=%.4f quote_date=%s duration_ms=%.0f",
                    symbol,
                    close,
                    qd,
                    (time.perf_counter() - started) * 1000,
                )
                return close, qd, "live_eod"
            if hasattr(ticker, "fast_info") and ticker.fast_info.get("lastPrice"):
                close = float(ticker.fast_info["lastPrice"])
                logger.info(
                    "yfinance fast_info symbol=%s close=%.4f duration_ms=%.0f",
                    symbol,
                    close,
                    (time.perf_counter() - started) * 1000,
                )
                return close, date.today(), "live"
        except Exception as e:
            logger.info(
                "yfinance no price symbol=%s duration_ms=%.0f err=%s",
                symbol,
                (time.perf_counter() - started) * 1000,
                str(e)[:200],
            )
        return None, None, "error"

    def get_company_name(self, symbol: str) -> Optional[str]:
        """Fetch short company/fund name for a symbol (cached in memory)."""
        symbol = symbol.upper().strip()
        if self._looks_like_non_ticker(symbol):
            return None

        # simple memory cache for names (separate from price cache)
        if not hasattr(self, '_company_names'):
            self._company_names: Dict[str, str] = {}
        if symbol in self._company_names:
            return self._company_names[symbol]

        try:
            ticker = yf.Ticker(symbol)
            name = None
            if hasattr(ticker, 'fast_info') and ticker.fast_info:
                name = ticker.fast_info.get('shortName') or ticker.fast_info.get('longName')
            if not name:
                info = ticker.info
                name = info.get('shortName') or info.get('longName') or info.get('displayName')
            if name:
                self._company_names[symbol] = name
                return name
        except Exception:
            pass
        return None

    def get_price(
        self, symbol: str, force_refresh: bool = False, db: Optional[Session] = None
    ) -> Tuple[float, str, Optional[datetime]]:
        symbol = symbol.upper().strip()
        now = datetime.now(UTC)

        if not force_refresh and self._looks_like_non_ticker(symbol):
            return 0.0, "non_ticker", None

        # Short-circuit recently failed symbols
        if not force_refresh and symbol in self._failed:
            if now - _ensure_utc(self._failed[symbol]) < timedelta(minutes=5):
                return 0.0, "error", None
            else:
                self._failed.pop(symbol, None)

        if force_refresh:
            self.invalidate(symbol)

        if symbol in self._memory:
            price, ts, source = self._memory[symbol]
            if now - _ensure_utc(ts) < self._ttl:
                return price, source, _ensure_utc(ts)

        if not force_refresh:
            redis_hit = get_redis_eod(symbol)
            if redis_hit:
                price, _quote_date, fetched, source = redis_hit
                self._memory[symbol] = (price, fetched, source)
                return price, source, fetched
            if db is not None:
                sqlite_hit = self._sqlite_get(db, symbol)
                if sqlite_hit:
                    price, fetched, source = sqlite_hit
                    self._memory[symbol] = (price, fetched, source)
                    return price, source, fetched

        price, quote_date, source = self._fetch_eod(symbol)
        if price is None or price <= 0 or quote_date is None:
            self._failed[symbol] = now
            return 0.0, "error", None

        fetched = now
        self._memory[symbol] = (price, fetched, source)
        self._failed.pop(symbol, None)
        set_redis_eod(symbol, price, quote_date, source)
        if db is not None:
            self._sqlite_set(db, symbol, price, quote_date, source)
        return price, source, fetched


market_data = MarketDataService(ttl_seconds=int(os.getenv("PRICE_CACHE_TTL", "120")))