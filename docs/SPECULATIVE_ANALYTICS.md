# Speculative analytics & planning (design spec)

**Status:** Product UI ships **one tool** — Monte Carlo net worth (`mc_net_worth_paths`) at `/planning`. Other tools in this doc are archival design; backend registry lists only MC. Outputs remain **speculative** — not accounting truth.

This document is the detailed companion to the **Speculative analytics & planning** section in [AGENTS.md](../AGENTS.md). Agents implementing any item must preserve [DATA_MODEL.md](./DATA_MODEL.md) invariants.

---

## 1. Goals

| Goal | Description |
|------|-------------|
| **What-if lab** | Run scenarios (retirement, tax, markets, spending) without writing to the ledger or balance sheet. |
| **Reproducibility** | Every run has a `scenario_id`, input snapshot hash, RNG seed, and versioned model parameters. |
| **Local-first** | Compute on the user machine; optional export of scenario JSON/CSV/PDF. No mandatory cloud. |
| **Honest uncertainty** | Monte Carlo and statistical tools expose assumptions, percentiles, and failure modes — not single "answers." |

## 2. Non-goals

- Replacing a CPA, financial planner, or tax filing software.
- Mutating `assets`, `liabilities`, `holdings`, or `transactions` from simulation results (user may **manually** act elsewhere).
- Reintroducing net-worth **history/snapshots** as a side effect of simulations (removed product decision).
- Real-time tax withholding integration with employers/brokers (out of scope unless explicitly added later).

## 3. Hard boundaries (agents must enforce)

1. **Net worth** remains `GET /net-worth/` from current balance sheet + portfolio only.
2. **Simulations** read copies of data + user **assumption profiles**; writes go only to `planning_*` tables or run result JSON (never ledger tables).
3. **Transactions** analytics may aggregate income/expense for *inputs* (e.g. average monthly spend) but must not feed net worth.
4. All API responses under `/planning/` or `/analytics/` include `disclaimer: "speculative"` and `as_of` timestamps for inputs.
5. Tax tools use **parameterized** brackets/deductions with explicit `tax_jurisdiction` and `tax_year`; default to "user must configure."

---

## 4. Conceptual architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Angular: /planning (or /lab) — scenario builder + results UI   │
└────────────────────────────┬────────────────────────────────────┘
                             │ FinanceService + PlanningService
┌────────────────────────────▼────────────────────────────────────┐
│  FastAPI routers/planning.py, routers/analytics.py              │
└────────────────────────────┬────────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
 services/planning/    services/analytics/    services/finance.py
  ├─ assumptions.py      ├─ monte_carlo.py       (read-only snapshots)
  ├─ retirement.py     ├─ tax_sim.py
  ├─ cashflow.py         ├─ stats.py
  └─ scenarios.py        └─ distributions.py
```

**Suggested packages**

| Path | Responsibility |
|------|----------------|
| `backend/services/planning/assumptions.py` | CRUD for assumption profiles (inflation, returns, tax params, retirement age). |
| `backend/services/planning/scenarios.py` | Compose inputs, validate, enqueue run, persist metadata. |
| `backend/services/analytics/monte_carlo.py` | Path simulation engine (vectorized NumPy preferred). |
| `backend/services/analytics/distributions.py` | Log-normal, normal, empirical bootstrap, correlated assets. |
| `backend/services/analytics/tax_sim.py` | Deterministic tax year projection from income events + config. |
| `backend/services/analytics/stats.py` | Ad hoc stats on transactions, holdings returns, custom series. |
| `backend/routers/planning.py` | REST for scenarios, runs, saved results. |
| `frontend/src/app/planning/` | Feature module: wizard, charts, comparison tables. |

**Dependencies (evaluate at implementation time)**

- `numpy`, `scipy` (distributions, optimization) — pin in `backend/requirements.txt`.
- Optional: `pandas` for bulk CSV export only (avoid making it a core runtime dependency if possible).

---

## 5. Data inputs

### 5.1 Automatic snapshots (read-only)

| Source | Use |
|--------|-----|
| `GET /net-worth/` | Starting wealth, asset/liability breakdown. |
| Holdings + prices | Portfolio weights, equity exposure, concentration. |
| Transactions (filtered) | Historical income/expense means, volatility, seasonality. |
| Liabilities | Interest rates, minimum payments, payoff timelines. |

### 5.2 User assumption profiles (`PlanningAssumptionProfile`)

Stored fields (illustrative — implement via Pydantic + SQLite):

- `name`, `base_currency`
- `birth_year`, `retirement_target_age`, `life_expectancy`
- `annual_income_growth`, `inflation_cpi`, `healthcare_inflation`
- `nominal_return_mean`, `nominal_return_std` (portfolio-level) **or** per-asset-class matrix
- `withdrawal_strategy` enum: `fixed_pct`, `guardrails`, `floor_ceiling`, `rmd_driven`
- `social_security` JSON: claiming ages, estimated PIA, cola
- `tax_jurisdiction`, `filing_status`, `state_code`, `tax_year_ruleset_id`
- `extra_contributions` JSON: 401k, IRA, HSA caps and schedule
- `major_events` JSON: home purchase, college, one-time in/outflows

### 5.3 Scenario runs (`PlanningScenarioRun`)

- `profile_id`, `tool_id`, `seed`, `n_paths`, `horizon_years`
- `input_snapshot_hash` (hash of net worth + tx summary + profile at run time)
- `status`, `started_at`, `finished_at`
- `result_summary` JSON (percentiles, success rate)
- `result_artifacts` optional blob paths or inline JSON for charts

---

## 6. Tool catalog

Each tool is a **registered capability** with `tool_id`, JSON schema for parameters, and deterministic test fixtures.

### 6.1 Monte Carlo & retirement

| tool_id | Name | Summary |
|---------|------|---------|
| `mc_net_worth_paths` | Net worth paths | Simulate total net worth under return/vol/inflation draws; output p10/p50/p90 by year. |
| `mc_portfolio_depletion` | Portfolio depletion | Focus on investable portfolio only; flag years where portfolio hits zero before horizon. |
| `retirement_success_rate` | Retirement success | Given spend target + horizon, % of paths where net worth > 0 (or portfolio > floor). |
| `withdrawal_guardrails` | Guardrails (Guyton-Klinger style) | Dynamic withdrawal rules with cut/increase bands; compare to fixed 4%. |
| `sequence_of_returns_stress` | Sequence-of-returns stress | Bad-first-years vs good-first-years with same CAGR; show retirement impact. |
| `fire_number` | FIRE / FI target | Capital needed for spend × multiplier (e.g. 25×) with optional MC adjustment for volatility. |
| `glide_path_whatif` | Glide path | Shift stock/bond allocation over time; re-run MC with rebalancing rules. |
| `social_security_claiming` | SS claiming compare | Claim at 62/67/70 (configurable) with COLA; integrate into total cash inflow MC. |
| `pension_lump_sum_vs_annuity` | Lump sum vs annuity | NPV comparison under mortality and discount rate assumptions. |

### 6.2 Cash flow & budget

| tool_id | Name | Summary |
|---------|------|---------|
| `cashflow_projection` | Deterministic cash flow | Month-by-month income − expense − debt service from profile + tx baselines. |
| `expense_runway` | Runway | Months until cash assets exhausted at current burn (deterministic + optional MC on spend). |
| `budget_stress_test` | Budget stress | Scale expense categories +X%; show impact on savings rate and FI date. |
| `income_shock` | Income shock | Job loss for N months; liquidity and debt coverage metrics. |
| `savings_rate_forecast` | Savings rate | Project savings rate from income growth and expense inflation assumptions. |

### 6.3 Tax simulation (parameterized, not advice)

| tool_id | Name | Summary |
|---------|------|---------|
| `tax_year_projection` | Annual tax projection | Ordinary + cap gains + deductions from scripted income events; marginal vs effective rate. |
| `bracket_fill_analysis` | Bracket fill | Room left in current bracket; visualize marginal rate staircase. |
| `roth_conversion_ladder` | Roth conversion ladder | Multi-year conversion amounts to fill brackets; IRMAA warnings as flags only. |
| `harvesting_whatif` | Tax-loss harvesting what-if | User-supplied lots; simulate harvest timing vs wash-sale window (manual lot entry). |
| `amt_niit_surtax_flags` | Parallel tax flags | Optional AMT/NIIT/surtax threshold warnings when ruleset enabled. |
| `withholding_estimator` | Withholding gap | Compare projected liability vs stated withholding; estimated refund/owed (educational). |
| `state_federal_combo` | State + federal combo | Layer state ruleset on federal when both configured. |

### 6.4 Debt & balance sheet what-if

| tool_id | Name | Summary |
|---------|------|---------|
| `debt_payoff_vs_invest` | Payoff vs invest | Compare extra payment to loan vs taxable brokerage at assumed after-tax return. |
| `refinance_break_even` | Refinance break-even | Closing costs vs rate reduction; months to break even. |
| `amortization_explorer` | Amortization | Schedule with extra payments; total interest saved. |
| `net_worth_sensitivity` | NW sensitivity | ±% on home value, portfolio, rates; tornado chart data. |

### 6.5 Ad hoc statistical analysis

| tool_id | Name | Summary |
|---------|------|---------|
| `tx_category_regression` | Category trend | OLS or robust trend on monthly spend per category (from transactions). |
| `tx_seasonality` | Seasonality | STL or Fourier-lite seasonality on expense totals; peak months. |
| `tx_anomaly_detect` | Anomaly detection | Z-score or IQR on daily/weekly spend; flag outliers for review (not auto-delete). |
| `portfolio_return_stats` | Return stats | Historical mean/vol/sharpe on holdings (user-chosen window); correlation matrix. |
| `bootstrap_spending` | Bootstrap spending | Resample monthly expenses to build empirical spend distribution for MC. |
| `correlation_matrix` | Correlation | Asset-class or ticker correlations from historical prices (data quality warnings). |
| `var_cvar` | VaR / CVaR | Portfolio loss percentiles for a horizon (parametric or historical simulation). |
| `custom_series_import` | Custom series | User uploads CSV column; run basic stats + optional fit to distribution. |

### 6.6 Scenario management & composition

| tool_id | Name | Summary |
|---------|------|---------|
| `scenario_compare` | Compare runs | Side-by-side two `PlanningScenarioRun` summaries. |
| `sensitivity_grid` | Sensitivity grid | Sweep two parameters (e.g. return ±, spend ±); heatmap data. |
| `monte_carlo_convergence` | MC convergence | Increase N until success rate stabilizes within epsilon; recommend N. |
| `export_scenario` | Export | JSON bundle: profile + inputs + results + seed for audit. |

---

## 7. API (implemented)

Prefix: `/planning/v1/` (versioned).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/tools` | List `tool_id`, descriptions, parameter schemas. |
| GET/POST/PATCH/DELETE | `/profiles` | Assumption profiles. |
| POST | `/runs` | Start run: `{ tool_id, profile_id, overrides, seed?, n_paths? }`. |
| GET | `/runs/{id}` | Status + summary + chart-ready series. |
| GET | `/runs/{id}/export` | Download reproducibility bundle. |
| POST | `/analytics/tx/stats` | Ad hoc transaction stats (body: filters + tool_id). |

Long runs: return `202` + poll, or WebSocket for progress (optional P3).

---

## 8. Frontend UX (implemented — v1 single page)

| Surface | Behavior |
|---------|----------|
| **Planning home** | Cards per tool category; disclaimer banner persistent. |
| **Profile editor** | Tabbed: Life, Markets, Tax, Cash flow, Events. |
| **Run builder** | Pick tool → profile → overrides → Run; show seed/N for MC. |
| **Results** | Percentile fan charts (reuse Chart.js lazy pattern), tables, "assumptions used" drawer. |
| **Compare** | Pin two runs; diff assumptions highlighted. |
| **Stats lab** | Transaction filters + pick stat tool; link outliers to Transactions page (read-only). |

Routes (proposed): `/planning`, `/planning/profiles`, `/planning/runs/:id`, `/planning/stats`.

See [FRONTEND.md](./FRONTEND.md) for `/planning` route. v1 uses one page with tabs; sub-routes and fan charts are backlog (P6).

---

## 9. Implementation phases

| Phase | Scope | Exit criteria |
|-------|--------|----------------|
| **P0 — Foundation** | `planning_*` tables, profiles CRUD, `/tools` registry, snapshot builder from finance service | Tests: profile round-trip; snapshot hash stable for fixed DB fixture |
| **P1 — Deterministic** | `cashflow_projection`, `fire_number`, `debt_payoff_vs_invest`, `amortization_explorer` | Golden JSON outputs for 3 fixtures |
| **P2 — Monte Carlo core** | `mc_net_worth_paths`, `retirement_success_rate`, `distributions`, seed reproducibility | Same seed → identical p50 path on CI |
| **P3 — Tax module** | `tax_year_projection`, `bracket_fill_analysis`, ruleset loader (JSON files in `backend/tax_rulesets/`) | Unit tests per ruleset version; no default "current year" without explicit user ruleset |
| **P4 — Stats lab** | Transaction stats tools, bootstrap spending | Uses transaction filters only; no net worth write |
| **P5 — UI** | Angular planning module, charts, export | `ng build` + manual QA checklist |
| **P6 — Advanced** | Roth ladder, SS claiming, sensitivity grid, optional async jobs | Documented in backlog if deferred |

---

## 10. Testing & validation strategy

| Layer | Approach |
|-------|----------|
| **Unit** | Distribution sampling, tax bracket math, amortization formulas — no DB. |
| **Integration** | Snapshot builder against `tests/fixtures/finance.db`. |
| **Statistical** | MC tests: loose bounds on p50 (not exact) unless seed fixed. |
| **Regression** | Golden files for deterministic tools under `backend/tests/planning/golden/`. |
| **Property** | Optional: `hypothesis` for monotonicity (higher spend → lower success rate). |

Agents must run `make test-backend` and add tests per tool before exposing in UI.

---

## 11. Security & privacy

- Assumption profiles may contain PII (birth year, income); keep in local SQLite; same backup warnings as `finance.db`.
- Export bundles may be sensitive; UI confirms before download.
- No telemetry on scenario inputs by default.

---

## 12. Open design decisions (resolve at implementation)

1. **Per-lot tax** vs portfolio-level cap gains approximation for v1.
2. **Empirical returns** from user portfolio history vs assumed mean/std only.
3. **Job queue** in-process vs SQLite-backed queue for large N MC.
4. **International tax** — US-first rulesets with extension points vs multi-country v1.

Log decisions in this file when closed.

---

## 13. Related docs to update when building

- [AGENTS.md](../AGENTS.md) — move items from speculative to implemented conventions.
- [README.md](../README.md) — feature list + disclaimer.
- [DATA_MODEL.md](./DATA_MODEL.md) — only if new `planning_*` tables are added (document separately from net worth).
- [ENGINEERING_BACKLOG.md](./ENGINEERING_BACKLOG.md) — track P6 and deferred tools.
