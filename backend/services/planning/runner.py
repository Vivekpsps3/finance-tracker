"""Dispatch planning tool_id to analytics implementations."""

from __future__ import annotations

import os
from threading import BoundedSemaphore
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Dict, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from schemas_planning import ProfilePayload
from services.analytics import monte_carlo
from services.planning.tools_registry import get_tool

_RUN_SLOTS = BoundedSemaphore(max(1, int(os.getenv("MC_MAX_CONCURRENT_RUNS", "2"))))


def execute_tool(
    db: Session,
    tool_id: str,
    snapshot: dict,
    profile: ProfilePayload,
    overrides: dict,
    *,
    seed: int = 42,
    n_paths: int = 100,
    horizon_years: int = 30,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    del db, overrides  # reserved for future tools
    try:
        get_tool(tool_id)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Unknown tool_id: {tool_id}")

    if tool_id == "mc_net_worth_paths":
        timeout_sec = float(os.getenv("MC_RUN_TIMEOUT_SEC", "120"))
        if not _RUN_SLOTS.acquire(blocking=False):
            raise HTTPException(status_code=429, detail="Monte Carlo simulation capacity is busy")
        release_slot = True

        def _run_mc() -> Tuple[Dict[str, Any], Dict[str, Any]]:
            return monte_carlo.mc_net_worth_paths(
                snapshot,
                profile,
                horizon_years=horizon_years,
                n_paths=n_paths,
                seed=seed,
            )

        try:
            pool = ThreadPoolExecutor(max_workers=1)
            future = pool.submit(_run_mc)
            try:
                result = future.result(timeout=timeout_sec)
            except FuturesTimeoutError:
                future.cancel()
                # A running thread cannot be forcibly stopped; retain its slot until it exits.
                future.add_done_callback(lambda _: _RUN_SLOTS.release())
                release_slot = False
                pool.shutdown(wait=False, cancel_futures=True)
                raise HTTPException(
                    status_code=504,
                    detail=f"Monte Carlo simulation timed out after {int(timeout_sec)}s",
                )
            else:
                pool.shutdown(wait=True)
                return result
        finally:
            if release_slot:
                _RUN_SLOTS.release()

    raise HTTPException(status_code=500, detail=f"Tool not wired: {tool_id}")
