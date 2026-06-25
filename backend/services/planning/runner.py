"""Dispatch planning tool_id to analytics implementations."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from schemas_planning import ProfilePayload
from services.analytics import monte_carlo
from services.planning.tools_registry import get_tool


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
        return monte_carlo.mc_net_worth_paths(
            snapshot,
            profile,
            horizon_years=horizon_years,
            n_paths=n_paths,
            seed=seed,
        )

    raise HTTPException(status_code=500, detail=f"Tool not wired: {tool_id}")