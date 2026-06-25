"""Planning lab API — speculative only; read-only ledger inputs."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import PlanningScenarioRun
from schemas_planning import (
    PlanningExportBundle,
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
def get_tools():
    return PlanningToolsResponse(tools=list_tools())


@router.get("/inputs", response_model=PlanningInputsPreview)
def get_inputs(db: Session = Depends(get_db)):
    snapshot = build_planning_snapshot(db)
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
def get_profiles(db: Session = Depends(get_db)):
    return profile_svc.list_profiles(db)


@router.post("/profiles", response_model=PlanningProfileResponse)
def post_profile(body: PlanningProfileCreate, db: Session = Depends(get_db)):
    return profile_svc.create_profile(db, body)


@router.get("/profiles/{profile_id}", response_model=PlanningProfileResponse)
def get_profile(profile_id: int, db: Session = Depends(get_db)):
    return profile_svc.get_profile(db, profile_id)


@router.patch("/profiles/{profile_id}", response_model=PlanningProfileResponse)
def patch_profile(profile_id: int, body: PlanningProfileUpdate, db: Session = Depends(get_db)):
    return profile_svc.update_profile(db, profile_id, body)


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    profile_svc.delete_profile(db, profile_id)


def _as_of_from_row(row: PlanningScenarioRun, snapshot: dict) -> datetime:
    raw = row.input_as_of or snapshot.get("as_of")
    if raw:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    return datetime.now(UTC)


def _run_to_response(row: PlanningScenarioRun, snapshot: dict) -> PlanningRunResponse:
    as_of = _as_of_from_row(row, snapshot)
    return PlanningRunResponse(
        id=row.id,
        tool_id=row.tool_id,
        profile_id=row.profile_id,
        status=row.status,
        input_snapshot_hash=row.input_snapshot_hash,
        as_of=as_of,
        seed=row.seed,
        n_paths=row.n_paths,
        horizon_years=row.horizon_years,
        result_summary=json.loads(row.result_summary_json or "{}"),
        result_artifacts=json.loads(row.result_artifacts_json or "{}"),
        started_at=row.started_at,
        finished_at=row.finished_at,
    )


@router.post("/runs", response_model=PlanningRunResponse)
def create_run(body: PlanningRunCreate, db: Session = Depends(get_db)):
    snapshot = build_planning_snapshot(db)
    h = snapshot_hash(snapshot)
    profile_resp = None
    if body.profile_id is not None:
        profile_resp = profile_svc.get_profile(db, body.profile_id)
    payload = profile_svc.merge_profile_payload(profile_resp, body.overrides)

    row = PlanningScenarioRun(
        profile_id=body.profile_id,
        tool_id=body.tool_id,
        seed=body.seed,
        n_paths=body.n_paths,
        horizon_years=body.horizon_years,
        overrides_json=json.dumps(body.overrides),
        input_snapshot_hash=h,
        status="running",
        input_as_of=snapshot.get("as_of"),
        started_at=datetime.now(UTC),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

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
        row.status = "completed"
        row.result_summary_json = json.dumps(summary)
        row.result_artifacts_json = json.dumps(artifacts)
        row.finished_at = datetime.now(UTC)
        db.commit()
        db.refresh(row)
    except HTTPException:
        row.status = "failed"
        row.finished_at = datetime.now(UTC)
        db.commit()
        raise
    except Exception as exc:
        row.status = "failed"
        row.result_summary_json = json.dumps({"error": str(exc)})
        row.finished_at = datetime.now(UTC)
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _run_to_response(row, snapshot)


@router.get("/runs/{run_id}", response_model=PlanningRunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    row = db.query(PlanningScenarioRun).filter(PlanningScenarioRun.id == run_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    snapshot = build_planning_snapshot(db)
    return _run_to_response(row, snapshot)


@router.get("/runs/{run_id}/export", response_model=PlanningExportBundle)
def export_run(run_id: int, db: Session = Depends(get_db)):
    row = db.query(PlanningScenarioRun).filter(PlanningScenarioRun.id == run_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    snapshot = build_planning_snapshot(db)
    run_resp = _run_to_response(row, snapshot)
    return PlanningExportBundle(
        run=run_resp,
        profile=profile_svc.get_profile(db, row.profile_id) if row.profile_id else None,
        snapshot_hash=row.input_snapshot_hash,
    )


