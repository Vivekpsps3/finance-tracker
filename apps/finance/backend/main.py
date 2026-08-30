"""
ASGI entrypoint. Tests and uvicorn use: uvicorn main:app

Re-exports database and market_data for backward compatibility.
"""
from app import app, uvicorn_log_config
from database import engine, get_db
from models import Base
from services.market_data import market_data

__all__ = ["app", "engine", "Base", "market_data", "get_db"]

if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", os.getenv("API_PORT", "8000"))),
        log_config=uvicorn_log_config(),
    )