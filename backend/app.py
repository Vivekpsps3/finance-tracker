import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # Load .env for local development (DB, Redis, API_KEY, etc.)

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from logging_config import get_logger, redact_database_url, setup_logging, uvicorn_log_config
from price_cache import EOD_MAX_AGE_HOURS, REDIS_URL
from api_auth import ApiKeyMiddleware
from rate_limit import RateLimitMiddleware
from request_logging import RequestLoggingMiddleware
from routers import assets, auth_routes, cashflow, fixed_expenses, health, holdings, imports, income, liabilities, market, net_worth, planning, subscriptions, transactions

setup_logging()
logger = get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from database import SQLALCHEMY_DATABASE_URL, init_database

    init_database()
    cors = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200"
        ).split(",")
        if o.strip()
    ]
    logger.info(
        "startup version=2.0.0 database=%s cors_origins=%s price_cache_ttl_s=%s eod_cache_hours=%s redis_configured=%s",
        redact_database_url(SQLALCHEMY_DATABASE_URL),
        cors,
        int(os.getenv("PRICE_CACHE_TTL", "120")),
        EOD_MAX_AGE_HOURS,
        bool(REDIS_URL),
    )
    yield
    logger.info("shutdown complete")


def create_app() -> FastAPI:
    disable_openapi = os.getenv("DISABLE_OPENAPI", "").lower() in ("1", "true", "yes")
    application = FastAPI(
        title="Finance Tracker API",
        version="2.0.0",
        lifespan=lifespan,
        docs_url=None if disable_openapi else "/docs",
        redoc_url=None if disable_openapi else "/redoc",
        openapi_url=None if disable_openapi else "/openapi.json",
    )

    cors_origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:4200,http://127.0.0.1:4200",
    ).split(",")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in cors_origins if o.strip()],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token"],
    )
    application.add_middleware(RateLimitMiddleware)
    application.add_middleware(ApiKeyMiddleware)
    application.add_middleware(RequestLoggingMiddleware)

    @application.exception_handler(HTTPException)
    async def log_http_exception(request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        logger.log(
            logging.ERROR if exc.status_code >= 500 else logging.WARNING,
            "http_error method=%s path=%s status=%s detail=%s",
            request.method,
            request.url.path,
            exc.status_code,
            detail,
        )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception(
            "unhandled_error method=%s path=%s exc_type=%s",
            request.method,
            request.url.path,
            type(exc).__name__,
        )
        return JSONResponse(status_code=500, content={"error": "Internal server error", "code": 500})

    api_prefix = "/api"
    application.include_router(health.router, prefix=api_prefix)
    application.include_router(auth_routes.router, prefix=api_prefix)
    application.include_router(imports.router, prefix=api_prefix)
    application.include_router(transactions.router, prefix=api_prefix)
    application.include_router(cashflow.router, prefix=api_prefix)
    application.include_router(income.router, prefix=api_prefix)
    application.include_router(fixed_expenses.router, prefix=api_prefix)
    application.include_router(subscriptions.router, prefix=api_prefix)
    application.include_router(assets.router, prefix=api_prefix)
    application.include_router(liabilities.router, prefix=api_prefix)
    application.include_router(market.router, prefix=api_prefix)
    application.include_router(holdings.router, prefix=api_prefix)
    application.include_router(net_worth.router, prefix=api_prefix)
    application.include_router(planning.router, prefix=api_prefix)

    return application


app = create_app()

__all__ = ["app", "create_app", "uvicorn_log_config"]
