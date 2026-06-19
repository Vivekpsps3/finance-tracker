import os
import time
from datetime import date, datetime, timedelta
from typing import Dict, Optional, Tuple

import yfinance as yf
from sqlalchemy.orm import Session

from logging_config import get_logger
from models import TickerQuote
from price_cache import get_redis_eod, set_redis_eod

logger = get_logger()


class MarketDataService:
    """In-memory hot cache + Redis/SQLite EOD close + yfinance on miss."""

    def __init__(self, ttl_seconds: int = 120):
        self._memory: Dict[str, Tuple[float, datetime, str]] = {}
        self._ttl = timedelta(seconds=ttl_seconds)
        self._eod_ttl = timedelta(hours=int(os.getenv("EOD_CACHE_HOURS", "24")))

    def invalidate(self, symbol: str) -> None:
        self._memory.pop(symbol.upper().strip(), None)

    def clear_memory_cache(self) -> None:
        self._memory.clear()

    def _sqlite_get(self, db: Session, symbol: str) -> Optional[Tuple[float, datetime, str]]:
        row = db.query(TickerQuote).filter(TickerQuote.symbol == symbol).first()
        if not row:
            return None
        if datetime.utcnow() - row.fetched_at > self._eod_ttl:
            return None
        return row.close_price, row.fetched_at, row.source or "sqlite_eod"

    def _sqlite_set(
        self, db: Session, symbol: str, close_price: float, quote_date: date, source: str
    ) -> None:
        now = datetime.utcnow()
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
        db.commit()

    def _fetch_eod(self, symbol: str) -> Tuple[Optional[float], Optional[date], str]:
        started = time.perf_counter()
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="5d", progress=False)
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
            logger.warning(
                "yfinance error symbol=%s duration_ms=%.0f err=%s",
                symbol,
                (time.perf_counter() - started) * 1000,
                e,
            )
        return None, None, "error"

    def get_price(
        self, symbol: str, force_refresh: bool = False, db: Optional[Session] = None
    ) -> Tuple[float, str, Optional[datetime]]:
        symbol = symbol.upper().strip()
        now = datetime.utcnow()
        if force_refresh:
            self.invalidate(symbol)

        if symbol in self._memory:
            price, ts, source = self._memory[symbol]
            if now - ts < self._ttl:
                return price, source, ts

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
            return 0.0, "error", None

        fetched = now
        self._memory[symbol] = (price, fetched, source)
        set_redis_eod(symbol, price, quote_date, source)
        if db is not None:
            self._sqlite_set(db, symbol, price, quote_date, source)
        return price, source, fetched


market_data = MarketDataService(ttl_seconds=int(os.getenv("PRICE_CACHE_TTL", "120")))