"""HTTP request/response logging middleware."""

from __future__ import annotations

import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from logging_config import LOG_ACCESS_HEALTH

logger = logging.getLogger("finance_api.access")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if path in ("/health", "/api/health") and not LOG_ACCESS_HEALTH:
            return await call_next(request)
        if request.method == "OPTIONS":
            return await call_next(request)

        start = time.perf_counter()
        client = request.client.host if request.client else "-"
        query = request.url.query
        path_logged = f"{path}?{query}" if query else path

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "request failed method=%s path=%s client=%s duration_ms=%.1f",
                request.method,
                path_logged,
                client,
                duration_ms,
            )
            raise

        duration_ms = (time.perf_counter() - start) * 1000
        level = logging.INFO
        if response.status_code >= 500:
            level = logging.ERROR
        elif response.status_code >= 400:
            level = logging.WARNING

        logger.log(
            level,
            "method=%s path=%s status=%s duration_ms=%.1f client=%s",
            request.method,
            path_logged,
            response.status_code,
            duration_ms,
            client,
        )
        return response