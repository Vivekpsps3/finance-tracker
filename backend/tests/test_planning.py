import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from main import Base, app, engine, market_data
from services.planning.assumptions import merge_profile_payload
from services.planning.snapshot import build_planning_snapshot, snapshot_hash
from services.planning.tools_registry import all_tool_ids
from services.analytics.monte_carlo import mc_net_worth_paths
from schemas_planning import (
    FAN_PATHS_PERSIST_MAX,
    PlanningCashflowEvent,
    PlanningCheckpoint,
    PlanningProfileResponse,
    ProfilePayload,
)


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    from migrations import run_sqlite_migrations
    run_sqlite_migrations(engine)
    market_data.clear_memory_cache()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


@pytest.fixture
def client():
    return TestClient(app)


def test_tools_registry_single_mc():
    ids = all_tool_ids()
    assert ids == ["mc_net_worth_paths"]


def test_profile_crud(client):
    r = client.post(
        "/api/planning/v1/profiles",
        json={"name": "Base", "base_currency": "USD", "payload": {"annual_spending": 48000}},
    )
    assert r.status_code == 200
    pid = r.json()["id"]
    assert client.get("/api/planning/v1/profiles").json()[0]["name"] == "Base"
    client.patch(f"/api/planning/v1/profiles/{pid}", json={"name": "Updated"})
    assert client.get(f"/api/planning/v1/profiles/{pid}").json()["name"] == "Updated"
    client.delete(f"/api/planning/v1/profiles/{pid}")
    assert client.get("/api/planning/v1/profiles").json() == []


def test_snapshot_hash_stable(client, monkeypatch):
    def fake_price(symbol, force_refresh=False, db=None):
        return 100.0, "live", None

    monkeypatch.setattr("main.market_data.get_price", fake_price)
    client.post(
        "/api/assets/",
        json={
            "name": "Checking",
            "category": "checking",
            "current_value": 5000,
            "as_of_date": str(date.today()),
        },
    )
    from database import SessionLocal
    db = SessionLocal()
    try:
        s1 = build_planning_snapshot(db)
        h1 = snapshot_hash(s1)
        h2 = snapshot_hash(s1)
        assert h1 == h2
    finally:
        db.close()


def test_mc_start_net_worth_override():
    snapshot = {
        "net_worth": {
            "total": 1_000_000,
            "portfolio": 800_000,
            "other_assets": 200_000,
            "liabilities": 0,
            "total_assets": 1_000_000,
        },
        "transactions": {},
    }
    profile = ProfilePayload(start_net_worth=250_000, annual_spending=40_000)
    summary, artifacts = mc_net_worth_paths(
        snapshot, profile, horizon_years=5, n_paths=100, seed=1
    )
    assert summary["start_net_worth"] == 250_000
    assert summary["ledger_net_worth"] == 1_000_000
    assert summary["start_net_worth_source"] == "profile.start_net_worth"
    assert artifacts["percentiles_by_year"]["p50"][0] == 250_000


def test_mc_fan_includes_every_simulated_path():
    snapshot = {
        "net_worth": {"total": 500_000, "portfolio": 0, "other_assets": 500_000, "liabilities": 0, "total_assets": 500_000},
        "transactions": {},
    }
    profile = ProfilePayload(annual_spending=40_000)
    _, art = mc_net_worth_paths(snapshot, profile, horizon_years=5, n_paths=250, seed=9)
    assert art["fan_paths_displayed"] == 250
    assert len(art["fan_paths"]) == 250


def test_mc_fixed_seed_reproducible():
    snapshot = {
        "net_worth": {
            "total": 1_000_000,
            "portfolio": 800_000,
            "other_assets": 200_000,
            "liabilities": 0,
            "total_assets": 1_000_000,
        },
        "transactions": {"avg_monthly_expense": 3000, "avg_monthly_income": 8000},
    }
    profile = ProfilePayload(annual_spending=36000, nominal_return_mean=0.07, nominal_return_std=0.15)
    s1, a1 = mc_net_worth_paths(snapshot, profile, horizon_years=10, n_paths=500, seed=12345)
    s2, a2 = mc_net_worth_paths(snapshot, profile, horizon_years=10, n_paths=500, seed=12345)
    assert s1["terminal_p50"] == s2["terminal_p50"]
    assert a1["percentiles_by_year"]["p50"] == a2["percentiles_by_year"]["p50"]
    assert "narrative" in s1
    assert "success_rate_pct" in s1


def test_run_does_not_mutate_ledger(client):
    client.post(
        "/api/transactions/",
        json={"date": str(date.today()), "type": "expense", "category": "Food", "amount": 50},
    )
    before = client.get("/api/net-worth/").json()["total"]
    client.post(
        "/api/planning/v1/runs",
        json={"tool_id": "mc_net_worth_paths", "overrides": {}, "n_paths": 200, "horizon_years": 5},
    )
    after = client.get("/api/net-worth/").json()["total"]
    assert before == after


def test_get_tools(client):
    r = client.get("/api/planning/v1/tools")
    assert r.status_code == 200
    assert "disclaimer" in r.json()
    assert len(r.json()["tools"]) == 1
    assert r.json()["tools"][0]["tool_id"] == "mc_net_worth_paths"


def test_get_inputs(client):
    r = client.get("/api/planning/v1/inputs")
    assert r.status_code == 200
    body = r.json()
    assert "net_worth_total" in body
    assert body["disclaimer"]


def test_mc_run_api(client):
    client.post(
        "/api/assets/",
        json={
            "name": "Cash",
            "category": "cash",
            "current_value": 500_000,
            "as_of_date": str(date.today()),
        },
    )
    run = client.post(
        "/api/planning/v1/runs",
        json={
            "tool_id": "mc_net_worth_paths",
            "overrides": {"annual_spending": 60000},
            "seed": 42,
            "n_paths": 300,
            "horizon_years": 20,
        },
    )
    assert run.status_code == 200
    body = run.json()
    assert body["status"] == "completed"
    assert body["id"] is None
    assert body["result_summary"]["success_rate_pct"] is not None
    assert body["result_artifacts"]["percentiles_by_year"]["p50"]
    assert body["disclaimer"]


def test_mc_run_api_same_seed_same_terminal_p50(client):
    client.post(
        "/api/assets/",
        json={
            "name": "Cash",
            "category": "cash",
            "current_value": 400_000,
            "as_of_date": str(date.today()),
        },
    )
    payload = {
        "tool_id": "mc_net_worth_paths",
        "overrides": {"annual_spending": 55_000},
        "seed": 4242,
        "n_paths": 400,
        "horizon_years": 15,
    }
    r1 = client.post("/api/planning/v1/runs", json=payload)
    r2 = client.post("/api/planning/v1/runs", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
    p50_1 = r1.json()["result_summary"]["terminal_p50"]
    p50_2 = r2.json()["result_summary"]["terminal_p50"]
    assert p50_1 == p50_2


def test_mc_persisted_fan_paths_capped_via_api(client):
    client.post(
        "/api/assets/",
        json={
            "name": "Cash",
            "category": "cash",
            "current_value": 100_000,
            "as_of_date": str(date.today()),
        },
    )
    run = client.post(
        "/api/planning/v1/runs",
        json={
            "tool_id": "mc_net_worth_paths",
            "overrides": {"annual_spending": 40_000},
            "seed": 7,
            "n_paths": 2000,
            "horizon_years": 10,
        },
    )
    assert run.status_code == 200
    art = run.json()["result_artifacts"]
    assert len(art["fan_paths"]) <= FAN_PATHS_PERSIST_MAX
    assert art["n_paths_simulated"] == 2000
    assert art["fan_paths_displayed"] == FAN_PATHS_PERSIST_MAX


def test_mc_fan_paths_downsampled_in_engine():
    snapshot = _minimal_snapshot(250_000.0)
    _, artifacts = mc_net_worth_paths(
        snapshot, ProfilePayload(annual_spending=50_000.0), horizon_years=5, n_paths=1200, seed=99
    )
    assert len(artifacts["fan_paths"]) == FAN_PATHS_PERSIST_MAX
    assert artifacts["n_paths_simulated"] == 1200


def test_unknown_tool_rejected(client):
    r = client.post("/api/planning/v1/runs", json={"tool_id": "fire_number", "overrides": {}})
    assert r.status_code == 400


def _minimal_snapshot(total: float = 100_000.0) -> dict:
    return {
        "net_worth": {
            "total": total,
            "portfolio": 0.0,
            "other_assets": total,
            "liabilities": 0.0,
            "total_assets": total,
        },
        "transactions": {},
    }


def test_mc_withdrawal_capped_when_assets_insufficient():
    """Draws cannot push balances unboundedly negative; wealth floors at zero."""
    snapshot = _minimal_snapshot(100_000.0)
    profile = ProfilePayload(
        annual_spending=500_000.0,
        monthly_income=0.0,
        nominal_return_mean=0.0,
        nominal_return_std=0.0,
        stable_return_mean=0.0,
        shock_probability=0.0,
        portfolio_allocation=0.5,
    )
    _, artifacts = mc_net_worth_paths(
        snapshot, profile, horizon_years=5, n_paths=32, seed=11
    )
    for path in artifacts["fan_paths"]:
        for value in path:
            assert value >= -0.01, f"path dipped below zero: {value}"


def test_mc_recurring_event_from_start_year_through_horizon():
    snapshot = _minimal_snapshot(500_000.0)
    profile = ProfilePayload(
        annual_spending=40_000.0,
        annual_cashflow_events=[
            PlanningCashflowEvent(
                label="Extra outflow",
                amount=-10_000.0,
                recurring=True,
                start_year=3,
                interval_years=1.0,
                inflation_adjusted=False,
            )
        ],
    )
    _, artifacts = mc_net_worth_paths(
        snapshot, profile, horizon_years=8, n_paths=10, seed=3
    )
    amounts = artifacts["annual_event_cashflow"]
    assert len(amounts) == 8
    assert amounts[0] == 0.0
    assert amounts[1] == 0.0
    assert amounts[2] == -10_000.0
    assert amounts[3] == -10_000.0
    assert amounts[7] == -10_000.0


def test_mc_recurring_every_two_years():
    snapshot = _minimal_snapshot(500_000.0)
    profile = ProfilePayload(
        annual_spending=10_000.0,
        annual_cashflow_events=[
            PlanningCashflowEvent(
                label="Biennial",
                amount=5_000.0,
                recurring=True,
                start_year=2,
                end_year=8,
                interval_years=2.0,
                inflation_adjusted=False,
            )
        ],
    )
    _, art = mc_net_worth_paths(snapshot, profile, horizon_years=8, n_paths=5, seed=1)
    amounts = art["annual_event_cashflow"]
    assert amounts[1] == 5_000.0  # year 2
    assert amounts[2] == 0.0
    assert amounts[3] == 5_000.0  # year 4
    assert amounts[5] == 5_000.0  # year 6
    assert amounts[7] == 5_000.0  # year 8


def test_mc_recurring_half_year_interval():
    snapshot = _minimal_snapshot(500_000.0)
    profile = ProfilePayload(
        annual_spending=10_000.0,
        annual_cashflow_events=[
            PlanningCashflowEvent(
                label="Semi-annual",
                amount=1_000.0,
                recurring=True,
                start_year=1,
                end_year=2,
                interval_years=0.5,
                inflation_adjusted=False,
            )
        ],
    )
    _, art = mc_net_worth_paths(snapshot, profile, horizon_years=2, n_paths=5, seed=1)
    amounts = art["annual_event_cashflow"]
    assert amounts[0] == 2_000.0  # t=0.5 and 1.0 in year 1
    assert amounts[1] == 2_000.0  # t=1.5 and 2.0 in year 2


def test_merge_profile_payload_lists_replaced_not_merged():
    base_event = PlanningCashflowEvent(label="Base", amount=-1_000.0, year=2, recurring=False)
    payload = ProfilePayload(
        annual_cashflow_events=[base_event],
        checkpoints=[PlanningCheckpoint(label="A", year=5, target_net_worth=1_000_000)],
    )
    profile = PlanningProfileResponse(
        id=1,
        name="Base",
        base_currency="USD",
        payload=payload,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    override_event = PlanningCashflowEvent(label="Only", amount=-9_000.0, year=3, recurring=False)
    merged = merge_profile_payload(
        profile,
        {
            "annual_cashflow_events": [override_event.model_dump()],
            "checkpoints": [],
        },
    )
    assert len(merged.annual_cashflow_events) == 1
    assert merged.annual_cashflow_events[0].label == "Only"
    assert merged.checkpoints == []


def test_merge_profile_payload_null_clears_manual_net_cashflow():
    payload = ProfilePayload(extra_contributions={"annual_contribution": 25_000.0})
    profile = PlanningProfileResponse(
        id=1,
        name="Base",
        base_currency="USD",
        payload=payload,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    merged = merge_profile_payload(
        profile, {"extra_contributions": {"annual_contribution": None}}
    )
    assert merged.extra_contributions.get("annual_contribution") is None

    snapshot = {
        **_minimal_snapshot(200_000.0),
        "transactions": {"avg_monthly_income": 5_000, "avg_monthly_expense": 2_000},
    }
    summary, _ = mc_net_worth_paths(
        snapshot, merged, horizon_years=2, n_paths=5, seed=1
    )
    assert summary["net_cashflow_source"] == "income_minus_spending"
    assert summary["annual_contribution_start"] == pytest.approx(36_000.0, rel=0.01)


def test_inputs_implied_spending_matches_mc_when_zero_tx_expense(client):
    inputs = client.get("/api/planning/v1/inputs").json()
    assert inputs["avg_monthly_expense"] == 0.0

    snapshot = _minimal_snapshot()
    snapshot["transactions"] = {"avg_monthly_expense": 0.0, "avg_monthly_income": 0.0}
    mc_summary, _ = mc_net_worth_paths(
        snapshot, ProfilePayload(), horizon_years=1, n_paths=5, seed=2
    )
    assert mc_summary["annual_spending_start"] == 40_000.0
    assert mc_summary["spend_assumption_source"] == "default_fallback_40000"
    assert inputs["implied_annual_spending"] == mc_summary["annual_spending_start"]
    assert inputs["annual_spending_source"] == "default_fallback_40000"


def test_mc_run_not_persisted(client):
    run = client.post(
        "/api/planning/v1/runs",
        json={
            "tool_id": "mc_net_worth_paths",
            "overrides": {"annual_spending": 50_000},
            "seed": 11,
            "n_paths": 200,
            "horizon_years": 8,
        },
    )
    assert run.status_code == 200
    body = run.json()
    assert body.get("id") is None
    assert body["status"] == "completed"
    from database import SessionLocal
    from models import PlanningScenarioRun

    db = SessionLocal()
    try:
        assert db.query(PlanningScenarioRun).count() == 0
    finally:
        db.close()


def test_mc_run_wall_clock_timeout(client, monkeypatch):
    import time

    def slow_mc(*args, **kwargs):
        time.sleep(3)
        return ({}, {})

    monkeypatch.setenv("MC_RUN_TIMEOUT_SEC", "1")
    monkeypatch.setattr("services.analytics.monte_carlo.mc_net_worth_paths", slow_mc)
    r = client.post(
        "/api/planning/v1/runs",
        json={
            "tool_id": "mc_net_worth_paths",
            "n_paths": 100,
            "horizon_years": 2,
            "seed": 1,
        },
    )
    assert r.status_code == 504
    assert "timed out" in r.json()["detail"].lower()