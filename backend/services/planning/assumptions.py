"""CRUD for planning assumption profiles."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import PlanningAssumptionProfile
from schemas_planning import (
    PlanningProfileCreate,
    PlanningProfileResponse,
    PlanningProfileUpdate,
    ProfilePayload,
)


def _payload_from_row(row: PlanningAssumptionProfile) -> ProfilePayload:
    raw = json.loads(row.payload_json or "{}")
    return ProfilePayload.model_validate(raw)


def profile_to_response(row: PlanningAssumptionProfile) -> PlanningProfileResponse:
    return PlanningProfileResponse(
        id=row.id,
        name=row.name,
        base_currency=row.base_currency,
        payload=_payload_from_row(row),
        created_at=row.created_at,
        updated_at=row.updated_at or row.created_at,
    )


def list_profiles(db: Session, user_id: int) -> List[PlanningProfileResponse]:
    rows = db.query(PlanningAssumptionProfile).filter(PlanningAssumptionProfile.user_id == user_id).order_by(PlanningAssumptionProfile.id).all()
    return [profile_to_response(r) for r in rows]


def get_profile(db: Session, user_id: int, profile_id: int) -> PlanningProfileResponse:
    row = db.query(PlanningAssumptionProfile).filter(PlanningAssumptionProfile.id == profile_id, PlanningAssumptionProfile.user_id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Planning profile not found")
    return profile_to_response(row)


def create_profile(db: Session, user_id: int, body: PlanningProfileCreate) -> PlanningProfileResponse:
    now = datetime.now(UTC)
    row = PlanningAssumptionProfile(
        user_id=user_id,
        name=body.name,
        base_currency=body.base_currency.upper(),
        payload_json=body.payload.model_dump_json(),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return profile_to_response(row)


def update_profile(db: Session, user_id: int, profile_id: int, body: PlanningProfileUpdate) -> PlanningProfileResponse:
    row = db.query(PlanningAssumptionProfile).filter(PlanningAssumptionProfile.id == profile_id, PlanningAssumptionProfile.user_id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Planning profile not found")
    if body.name is not None:
        row.name = body.name
    if body.base_currency is not None:
        row.base_currency = body.base_currency.upper()
    if body.payload is not None:
        row.payload_json = body.payload.model_dump_json()
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return profile_to_response(row)


def delete_profile(db: Session, user_id: int, profile_id: int) -> None:
    from models import PlanningScenarioRun

    row = db.query(PlanningAssumptionProfile).filter(PlanningAssumptionProfile.id == profile_id, PlanningAssumptionProfile.user_id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Planning profile not found")
    db.query(PlanningScenarioRun).filter(PlanningScenarioRun.user_id == user_id, PlanningScenarioRun.profile_id == profile_id).update(
        {PlanningScenarioRun.profile_id: None}
    )
    db.delete(row)
    db.commit()


def merge_profile_payload(
    profile: Optional[PlanningProfileResponse],
    overrides: dict,
) -> ProfilePayload:
    """Merge run ``overrides`` onto a saved profile (or empty defaults).

    Rules (BE-010):
    - Top-level keys from ``overrides`` replace or patch the base payload.
    - When **both** base and override values for a key are ``dict`` (e.g.
      ``extra_contributions``), keys are merged **one level** deep.
    - **Lists** (``annual_cashflow_events``, ``checkpoints``, etc.) are **replaced
      entirely** when present in ``overrides`` — not appended or merged.
    - ``null`` in an override dict can clear nested keys (see tests).

    API: ``POST /planning/v1/runs`` applies this before simulation; responses do
    not echo the merged payload (see ``result_summary`` only).
    """
    base = profile.payload if profile else ProfilePayload()
    merged = base.model_dump()
    for k, v in overrides.items():
        if k in merged and isinstance(merged[k], dict) and isinstance(v, dict):
            merged[k] = {**merged[k], **v}
        else:
            merged[k] = v
    return ProfilePayload.model_validate(merged)
