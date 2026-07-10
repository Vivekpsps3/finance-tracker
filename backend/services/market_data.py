import os
import json
import math
import time
from datetime import UTC, date, datetime, timedelta
from typing import Any, Dict, Optional, Tuple

import yfinance as yf
from sqlalchemy.orm import Session

from logging_config import get_logger
from models import MarketResearchCache, TickerQuote
from price_cache import get_redis_eod, set_redis_eod
from schemas_market import (
    MarketDividendEvent,
    MarketInstrumentProfile,
    MarketPricePoint,
    MarketQuoteSummary,
    MarketResearchResponse,
    MarketSplitEvent,
)

logger = get_logger()


def _ensure_utc(dt: datetime) -> datetime:
    """Normalize DB/memory datetimes for comparison (legacy rows may be naive UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _finite_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _compact_dict(data: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in keys:
        value = data.get(key)
        if value is not None and value == value:
            out[key] = value
    return out


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

    def _research_cache_get(
        self, db: Session, symbol: str, period: str
    ) -> Optional[MarketResearchResponse]:
        row = (
            db.query(MarketResearchCache)
            .filter(MarketResearchCache.symbol == symbol, MarketResearchCache.period == period)
            .first()
        )
        if not row or _ensure_utc(row.expires_at) <= datetime.now(UTC):
            return None
        payload = json.loads(row.payload_json)
        payload["cache_status"] = "hit"
        return MarketResearchResponse.model_validate(payload)

    def _research_cache_set(
        self, db: Session, symbol: str, period: str, response: MarketResearchResponse
    ) -> None:
        now = datetime.now(UTC)
        expires = now + self._eod_ttl
        payload = response.model_dump(mode="json")
        payload["cache_status"] = "hit"
        row = (
            db.query(MarketResearchCache)
            .filter(MarketResearchCache.symbol == symbol, MarketResearchCache.period == period)
            .first()
        )
        if row:
            row.payload_json = json.dumps(payload, separators=(",", ":"))
            row.source = response.source
            row.fetched_at = now
            row.expires_at = expires
        else:
            db.add(
                MarketResearchCache(
                    symbol=symbol,
                    period=period,
                    payload_json=json.dumps(payload, separators=(",", ":")),
                    source=response.source,
                    fetched_at=now,
                    expires_at=expires,
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

    def _fetch_research(self, symbol: str, period: str) -> MarketResearchResponse:
        now = datetime.now(UTC)
        warnings: list[str] = []
        ticker = yf.Ticker(symbol)
        info: dict[str, Any] = {}
        try:
            info = dict(ticker.info or {})
        except Exception as exc:
            warnings.append(f"metadata unavailable: {str(exc)[:120]}")

        history_points: list[MarketPricePoint] = []
        try:
            hist = ticker.history(period=period, auto_adjust=False)
            if hist is not None and not hist.empty:
                for idx, row in hist.iterrows():
                    close = _finite_float(row.get("Close"))
                    if close is None or close <= 0:
                        continue
                    history_points.append(
                        MarketPricePoint(
                            date=idx.date().isoformat() if hasattr(idx, "date") else str(idx)[:10],
                            open=_finite_float(row.get("Open")),
                            high=_finite_float(row.get("High")),
                            low=_finite_float(row.get("Low")),
                            close=close,
                            adjusted_close=_finite_float(row.get("Adj Close")),
                            volume=_finite_float(row.get("Volume")),
                        )
                    )
            else:
                warnings.append("price history unavailable")
        except Exception as exc:
            warnings.append(f"price history unavailable: {str(exc)[:120]}")

        dividends: list[MarketDividendEvent] = []
        try:
            div_series = ticker.dividends
            if div_series is not None:
                for idx, amount in div_series.items():
                    value = _finite_float(amount)
                    if value is not None and value > 0:
                        dividends.append(
                            MarketDividendEvent(
                                date=idx.date().isoformat() if hasattr(idx, "date") else str(idx)[:10],
                                amount=value,
                            )
                        )
        except Exception as exc:
            warnings.append(f"dividends unavailable: {str(exc)[:120]}")

        splits: list[MarketSplitEvent] = []
        try:
            split_series = ticker.splits
            if split_series is not None:
                for idx, ratio in split_series.items():
                    value = _finite_float(ratio)
                    if value is not None and value > 0:
                        splits.append(
                            MarketSplitEvent(
                                date=idx.date().isoformat() if hasattr(idx, "date") else str(idx)[:10],
                                ratio=value,
                            )
                        )
        except Exception as exc:
            warnings.append(f"splits unavailable: {str(exc)[:120]}")

        price = _finite_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        if price is None and history_points:
            price = history_points[-1].close
        profile = MarketInstrumentProfile(
            name=info.get("shortName") or info.get("longName") or info.get("displayName"),
            asset_type=(info.get("quoteType") or "unknown").lower(),
            exchange=info.get("exchange"),
            currency=info.get("currency"),
            sector=info.get("sector"),
            industry=info.get("industry"),
            website=info.get("website"),
            quote_type=info.get("quoteType"),
        )
        quote = MarketQuoteSummary(
            current_price=price,
            previous_close=_finite_float(info.get("previousClose")),
            open=_finite_float(info.get("open")),
            day_high=_finite_float(info.get("dayHigh")),
            day_low=_finite_float(info.get("dayLow")),
            fifty_two_week_high=_finite_float(info.get("fiftyTwoWeekHigh")),
            fifty_two_week_low=_finite_float(info.get("fiftyTwoWeekLow")),
            market_cap=_finite_float(info.get("marketCap")),
            beta=_finite_float(info.get("beta")),
            trailing_pe=_finite_float(info.get("trailingPE")),
            forward_pe=_finite_float(info.get("forwardPE")),
            dividend_rate=_finite_float(info.get("dividendRate")),
            dividend_yield=_finite_float(info.get("dividendYield")),
        )
        fundamentals = _compact_dict(
            info,
            ["marketCap", "trailingPE", "forwardPE", "trailingEps", "revenueGrowth", "profitMargins", "beta"],
        ) or None
        etf = _compact_dict(info, ["category", "expenseRatio", "navPrice", "yield", "totalAssets"]) or None
        analyst = _compact_dict(
            info,
            ["targetHighPrice", "targetLowPrice", "targetMeanPrice", "recommendationKey", "numberOfAnalystOpinions"],
        ) or None
        return MarketResearchResponse(
            symbol=symbol,
            valid=bool(price or history_points),
            source="yfinance",
            fetched_at=now,
            cache_status="miss",
            warnings=warnings,
            profile=profile,
            quote=quote,
            history=history_points,
            dividends=dividends,
            splits=splits,
            fundamentals=fundamentals,
            etf=etf,
            analyst=analyst,
        )

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

    def get_research(
        self,
        symbol: str,
        period: str = "10y",
        force_refresh: bool = False,
        db: Optional[Session] = None,
    ) -> MarketResearchResponse:
        symbol = symbol.upper().strip()
        period = period.lower().strip() or "10y"
        if period not in {"1y", "2y", "5y", "10y", "max"}:
            period = "10y"
        if not force_refresh and db is not None:
            cached = self._research_cache_get(db, symbol, period)
            if cached:
                return cached
        response = self._fetch_research(symbol, period)
        response.cache_status = "refresh" if force_refresh else "miss"
        if db is not None and response.valid:
            self._research_cache_set(db, symbol, period, response)
        return response


market_data = MarketDataService(ttl_seconds=int(os.getenv("PRICE_CACHE_TTL", "120")))
