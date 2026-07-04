"""Planning lab API — speculative only; read-only ledger inputs."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from schemas_planning import (
    PlanningProfileCreate,
    PlanningProfileResponse,
    PlanningProfileUpdate,
    PlanningRunCreate,
    PlanningRunResponse,
    PlanningInputsPreview,
    PlanningToolsResponse,
)
from services.planning import assumptions as profile_svc
from services.planning.runner import execute_tool
from services.planning.snapshot import build_planning_snapshot, snapshot_hash
from services.planning.tools_registry import list_tools
router = APIRouter(prefix="/planning/v1", tags=["planning"])


@router.get("/tools", response_model=PlanningToolsResponse)
def get_tools(current_user: User = Depends(get_current_user)):
    return PlanningToolsResponse(tools=list_tools())


@router.get("/inputs", response_model=PlanningInputsPreview)
def get_inputs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    snapshot = build_planning_snapshot(db, current_user.id)
    tx = snapshot.get("transactions", {})
    inc_m = float(tx.get("avg_monthly_income", 0) or 0)
    from services.analytics.monte_carlo import annual_spending_from_transactions

    exp_m = float(tx.get("avg_monthly_expense", 0) or 0)
    spend_y, spend_source = annual_spending_from_transactions(tx)
    sav_y = max(0.0, inc_m * 12 - spend_y)
    nw = snapshot["net_worth"]
    as_of_raw = snapshot.get("as_of")
    as_of = (
        datetime.fromisoformat(str(as_of_raw).replace("Z", "+00:00"))
        if as_of_raw
        else datetime.now(UTC)
    )
    return PlanningInputsPreview(
        as_of=as_of,
        snapshot_hash=snapshot_hash(snapshot),
        net_worth_total=float(nw["total"]),
        net_worth_portfolio=float(nw.get("portfolio", 0)),
        net_worth_liabilities=float(nw.get("liabilities", 0)),
        avg_monthly_income=inc_m,
        avg_monthly_expense=exp_m,
        implied_annual_spending=round(spend_y, 2),
        implied_annual_savings=round(sav_y, 2),
        transaction_count=int(tx.get("transaction_count", 0)),
        annual_spending_source=spend_source,
    )


@router.get("/profiles", response_model=List[PlanningProfileResponse])
def get_profiles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return profile_svc.list_profiles(db, current_user.id)


@router.post("/profiles", response_model=PlanningProfileResponse)
def post_profile(body: PlanningProfileCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return profile_svc.create_profile(db, current_user.id, body)


@router.get("/profiles/{profile_id}", response_model=PlanningProfileResponse)
def get_profile(profile_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return profile_svc.get_profile(db, current_user.id, profile_id)


@router.patch("/profiles/{profile_id}", response_model=PlanningProfileResponse)
def patch_profile(profile_id: int, body: PlanningProfileUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return profile_svc.update_profile(db, current_user.id, profile_id, body)


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    profile_svc.delete_profile(db, current_user.id, profile_id)


def _as_of_from_snapshot(snapshot: dict) -> datetime:
    raw = snapshot.get("as_of")
    if raw:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    return datetime.now(UTC)


@router.post("/runs", response_model=PlanningRunResponse)
def create_run(body: PlanningRunCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Execute Monte Carlo once; results are not persisted (saved inputs = profiles only)."""
    snapshot = build_planning_snapshot(db, current_user.id)
    h = snapshot_hash(snapshot)
    profile_resp = None
    if body.profile_id is not None:
        profile_resp = profile_svc.get_profile(db, current_user.id, body.profile_id)
    payload = profile_svc.merge_profile_payload(profile_resp, body.overrides)
    started = datetime.now(UTC)

    try:
        summary, artifacts = execute_tool(
            db,
            body.tool_id,
            snapshot,
            payload,
            body.overrides,
            seed=body.seed or 42,
            n_paths=body.n_paths or 100,
            horizon_years=body.horizon_years or 30,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    finished = datetime.now(UTC)
    return PlanningRunResponse(
        id=None,
        tool_id=body.tool_id,
        profile_id=body.profile_id,
        status="completed",
        input_snapshot_hash=h,
        as_of=_as_of_from_snapshot(snapshot),
        seed=body.seed,
        n_paths=body.n_paths,
        horizon_years=body.horizon_years,
        result_summary=summary,
        result_artifacts=artifacts,
        started_at=started,
        finished_at=finished,
    )


