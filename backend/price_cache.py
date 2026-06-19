"""Optional Redis cache for EOD ticker quotes (key: eod:{SYMBOL})."""

from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timedelta
from typing import Optional, Tuple

logger = logging.getLogger("finance_api")

REDIS_URL = os.getenv("REDIS_URL", "").strip()
EOD_MAX_AGE_HOURS = int(os.getenv("EOD_CACHE_HOURS", "24"))

_redis_client = None
_redis_tried = False


def _redis():
    global _redis_client, _redis_tried
    if _redis_tried:
        return _redis_client
    _redis_tried = True
    if not REDIS_URL:
        return None
    try:
        import redis

        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        _redis_client.ping()
        logger.info("Redis EOD price cache enabled")
    except Exception as e:
        logger.warning("Redis unavailable (%s); SQLite EOD cache still used", e)
        _redis_client = None
    return _redis_client


def _key(symbol: str) -> str:
    return f"eod:{symbol.upper()}"


def get_redis_eod(symbol: str) -> Optional[Tuple[float, date, datetime, str]]:
    client = _redis()
    if not client:
        return None
    try:
        raw = client.get(_key(symbol))
        if not raw:
            return None
        data = json.loads(raw)
        fetched = datetime.fromisoformat(data["fetched_at"])
        if datetime.utcnow() - fetched > timedelta(hours=EOD_MAX_AGE_HOURS):
            return None
        qd = date.fromisoformat(data["quote_date"])
        logger.debug("redis eod hit symbol=%s price=%.4f quote_date=%s", symbol, float(data["close_price"]), qd)
        return float(data["close_price"]), qd, fetched, data.get("source", "redis_eod")
    except Exception as e:
        logger.debug("Redis get %s: %s", symbol, e)
        return None


def set_redis_eod(symbol: str, close_price: float, quote_date: date, source: str) -> None:
    client = _redis()
    if not client:
        return
    try:
        payload = {
            "close_price": close_price,
            "quote_date": quote_date.isoformat(),
            "fetched_at": datetime.utcnow().isoformat(),
            "source": source,
        }
        client.setex(_key(symbol), timedelta(hours=EOD_MAX_AGE_HOURS), json.dumps(payload))
        logger.debug("redis eod set symbol=%s price=%.4f quote_date=%s", symbol, close_price, quote_date)
    except Exception as e:
        logger.debug("Redis set %s: %s", symbol, e)