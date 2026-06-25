# Detailed Implementation Plan: Fidelity CSV Portfolio Import + Remove Net Worth History

**Date**: 2026-06-23 (updated 2026-06-24)  
**Status**: **Implemented** — parser, `/api/imports/fidelity/*`, portfolio UI, tests in `backend/tests/test_fidelity_import.py`. This doc remains the design record; net-worth history removal is done.  
**Goal**: Add support for importing Fidelity position CSVs into the Portfolio. Each Fidelity account is tracked separately. Import **replaces** (resets) positions for the accounts present in the CSV.  
Reuse patterns from bank (transactions) imports where possible for deduplication.  
**Delete** the entire net worth history / snapshot feature (overly complex, not used for "now" net worth). Show current net worth meaningfully, with better account-aware breakdown where it makes sense.  
**Constraints** (from AGENTS.md + domain):  
- Net worth = other_assets + portfolio MV − liabilities (unchanged rule).  
- Portfolio (holdings + prices) is the investment slice.  
- No hard-coded values (use registry/configs, slugs, dynamic account masks from CSV).  
- Follow safe change checklist: read router/service/component, keep schema+FinanceService+models in sync, update README + docs/FRONTEND.md, run tests + build.  
- Code is source of truth.  
- OnPush, standalone, ui-* primitives, central FinanceService.  
- Do not break existing manual holdings / asset / liability flows.

## 1. Current State Analysis (from full codebase scan)
### Backend
- `models.py`: `Holding` is flat (id, symbol, shares, purchase_price, purchase_date). No account/source. `NetWorthSnapshot` table + `Bank`/`BankAccount`/`ImportBatch` for tx imports.
- `schemas.py`: `Holding*`, `NetWorthResponse` (flat other/portfolio/liab + portfolio_sources dict by symbol), `NetWorthHistoryPoint`, full bank import types (preview/commit with dedupe_key).
- `services/finance.py` (~411 LOC): `compute_net_worth`, `compute_portfolio`, `holding_to_response` (uses market_data), `record_net_worth_snapshot`, `build_net_worth_history`, `get_or_create_bank*`, preview/commit_bank_import (dedupe via key + insert txns), lots of helpers.
- `routers/`: separate `holdings.py` (CRUD + record snapshot on mut), `net_worth.py` (current + history), `imports.py` (thin aliases + generic /imports/{slug}), `assets.py`/`liabilities.py` (record snapshot).
- `import_registry.py`: `BANK_IMPORTS` dict + `BankImportConfig` (slug/name/hint/extensions/parse fn). Capital One only.
- `import_parsers/`: `types.py` (ParsedImportRow for txns), `dedupe.py`, `capital_one.py` (strict header parse, skip credits, build dedupe).
- `migrations.py`: Adds columns for tx import fields + net worth snapshot fields (other_assets etc).
- `app.py`: Registers routers including net_worth, imports, holdings.
- `database.py`: init + migrations on start.
- Tests: `test_capital_one_import.py` (parser + preview/commit + "does not change net worth"), balance sheet, api tests. Some assume snapshots.
- `market_data.py`, price cache etc: unchanged (still used for current MV of holdings).

### Frontend
- `models/transaction.model.ts`: Holding (flat), NetWorth (flat + sources), NetWorthHistoryPoint, full bank import DTOs (ImportPreviewRow has dedupe/account etc), no brokerage concepts.
- `services/finance.service.ts` (~367 LOC): Subjects for holdings/netWorth/history/assets/liab. `loadDashboard()` forks tx+holdings+netWorth+history. get/add/update/deleteHolding, getNetWorth + getNetWorthHistory, bank preview/commit (formdata + json). refreshDerivedMetrics calls history.
- `portfolio/portfolio.component.ts` + `.html`: Flat table + search + add/edit/delete modal + price refresh + summary (total value + gain using `portfolio.util.ts`). No accounts, no import UI.
- `dashboard/dashboard.component.ts` + `.html`: Subscribes history + netWorth + tx. Period filter affects filteredHistory + charts. Hero shows current net worth breakdown (other_assets / Investments / Liabilities). Uses ChartsComponent.
- `charts/charts.component.ts` + `.html`: Renders 3 charts. Income/expense from tx, allocation from holdings (current), **"Net Worth Over Time"** line chart + table from history (explicitly "Snapshots when you update...").
- `transactions/transactions.component.ts` + `.html`: Mature "Import from bank" flow: open modal → select bank (from getImportBanks) → file → preview (calls service) → select new rows (dedupe shown) → commit. Reuses ui-* , toasts, confirm. Very similar pattern desired for portfolio.
- Other: `utils/portfolio.util.ts` (pure gain/value calcs), date/export utils, shared ui primitives (button/card etc), proxy prefixes include /holdings /net-worth /imports, environment apiUrl:'' for dev.
- No "account" on holdings. Portfolio page is the place per user ("add import feature to the 'portfolio' section and break it down by account").

### Cross-cutting / Docs
- History/snapshots called after every asset/liab/holding create/update/delete (via record_...).
- Proxy + CORS cover the paths.
- DATA_MODEL.md, README, FRONTEND.md, ADDING_A_BANK_IMPORT.md describe current (tx imports don't affect NW; snapshots on balance/holdings).
- ENGINEERING_BACKLOG mentions polish but not this.
- No Fidelity, no brokerage accounts anywhere.
- "Don't hardcode": bank pattern uses dynamic slugs from registry + CSV-driven account_mask.

**Problems to solve**:
- Holdings lack account scoping → can't "per Fidelity account" or "reset specific accounts" or "break down by account".
- History feature must be surgically removed (DB table, all call sites, UI charts, service subjects, dashboard/chart components, load paths, tests, docs).
- Fidelity CSV format is holdings snapshot (Account Number/Name, Symbol, Quantity=shares, Average Cost Basis, Cost Basis Total, Current Value). Not txns. No reliable per-lot purchase date. "Reset" semantics (replace for accounts in file).
- Reuse bank import pattern (registry, parser module, preview/commit, FE modal flow) but adapt (different row shape, replace instead of dedupe-append, holdings domain).
- Keep manual holdings working (perhaps as "Manual" account or null account_id).
- Enhance "net worth NOW": keep/enhance current breakdown in hero; make portfolio page account-aware; optionally expose account breakdown in NetWorthResponse.
- Update on mutations: still record "current" via compute, but no snapshots.
- Follow conventions: no breaking FinanceService signatures without updates; update docs; test+build.

## 2. Proposed Architecture (for dedup + best practices)
### Data Model Evolution (minimal, backward compatible where possible)
- **New tables** (modeled exactly on Bank/BankAccount for reuse):
  - `brokerages` (id, slug unique, name) — e.g. slug="fidelity", name="Fidelity"
  - `brokerage_accounts` (id, brokerage_id FK, account_mask unique-per-broker, label) — e.g. mask="Z21741448", label="Fidelity ···Z21741448 (Individual)"
- **Alter `holdings`**:
  - Add `brokerage_account_id` INTEGER NULL (FK to brokerage_accounts.id)
  - (purchase_price stays as "cost basis used for gain"; for Fidelity imports we'll populate from "Average Cost Basis")
  - No new required fields on existing rows.
- **Drop entirely**:
  - `net_worth_snapshots` table + all related columns/logic.
- **Update compute**:
  - `compute_portfolio` → also return or have helper for `portfolio_by_account: Dict[str, float]` (account_label → value). Use joined query when account present.
  - Enhance `NetWorthResponse` (add optional `portfolio_breakdown?: Record<string, number>` or typed list for accounts). "Manual" holdings (null account) grouped as one bucket.
- Migrations: extend `migrations.py` with:
  - CREATE TABLEs for new broker* (if not exists).
  - ALTER TABLE holdings ADD COLUMN brokerage_account_id ...
  - DROP TABLE IF EXISTS net_worth_snapshots (and any indexes).
  - Backfill? For existing holdings, leave brokerage_account_id=NULL (treat as "Manual / Unassigned").

**Why this?** Mirrors proven bank account pattern (get_or_create_*, label formatting "· ··mask", display). Allows future brokers (Schwab etc) without hardcoding. Dedup logic in finance.py.

### Import System (reuse + parallel structure for holdings domain)
- **Extend `import_registry.py`** (or small new `portfolio_import_registry.py` — prefer extend for dedup):
  - Add `BROKERAGE_IMPORTS: Dict[str, BrokerageImportConfig]` parallel to BANK.
  - `BrokerageImportConfig(slug, name, hint, file_extensions, parse: Callable[[str], List[ParsedHoldingRow]])`
  - `list_brokerage_imports()`, `get_brokerage_import(slug)`, aliases if needed.
  - Do **not** mix with bank — separate to avoid type confusion.
- **New parser**: `import_parsers/fidelity.py` (exact parallel to capital_one.py):
  - Constants: `BANK_SLUG = "fidelity"`, `BANK_NAME="Fidelity"`, `IMPORT_HINT=...` (copy disclaimer note?).
  - `REQUIRED_HEADERS` from the sample (lowercased normalized).
  - `parse_fidelity_csv(content: str) -> List[ParsedFidelityRow]`
  - `ParsedFidelityRow` dataclass (new in types.py or holdings-specific): `account_mask: str, account_name: str, symbol: str, shares: float, avg_cost_basis: float, cost_basis_total: float`
  - Handle: utf8-sig, empty rows, normalize "SPAXX**" → "SPAXX", upper symbols, float parsing (strip $, commas), skip header validation strictly.
  - **No dedupe_key** (different domain). Parser just extracts positions.
  - Date downloaded note ignored (CSV has no tx date).
- **In `services/finance.py`** (centralize, dedup helpers):
  - New: `get_or_create_brokerage`, `get_or_create_brokerage_account` (copy-paste pattern from bank, adapt names).
  - New helpers: `preview_fidelity_import(...)`, `commit_fidelity_import(slug, body, db)`.
  - For preview: parse, group by account, return counts of "accounts affected", "positions", "total shares/value from cost".
  - For commit (the "reset"):
    - Get/create brokerage + accounts for each unique in file.
    - For each account in the import file: `db.query(Holding).filter(Holding.brokerage_account_id == acc.id).delete()`
    - Then insert new `Holding(symbol=..., shares=..., purchase_price=avg_cost or cost_total/shares, purchase_date=today(), brokerage_account_id=...)`
    - No snapshots.
    - Return summary: replaced, inserted, accounts.
  - Update `compute_portfolio` and add `compute_portfolio_breakdown(db) -> Dict[str, float]`.
  - Update `holding_to_response` to optionally join and include `account_display?: string`.
  - Strip all `record_net_worth_snapshot` calls and related imports.
- **New schemas** (in schemas.py, parallel to bank import ones):
  - `FidelityImportOption` (reuse BankImportOption? or specific; prefer specific or extend base for dedup).
  - `FidelityPreviewRow` (symbol, shares, avg_cost, est_value?, account_mask, account_display, status? 'replace')
  - `FidelityPreviewResponse` (broker, filename, accounts: List[str], rows: [...], summary: {accounts: int, positions: int, total_cost: float})
  - `FidelityCommitRequest` (filename, rows: List[dict with account+holding fields] — since replace, send all or selected).
  - `FidelityCommitResponse` (accounts_replaced: int, holdings_replaced: int, inserted: int, ...)
  - Update `HoldingResponse` to add `account_display?: string | null` (optional for backward).
- **Router** (`routers/imports.py` or new `routers/portfolio_imports.py` — prefer extend imports.py for pattern reuse):
  - `GET /imports/brokerages` (or /imports/fidelity-accounts) → list.
  - `POST /imports/fidelity/preview`
  - `POST /imports/fidelity/commit`
  - Keep bank ones untouched. Use generic if easy, else specific aliases like capital-one.
- **Update holdings router** minimally: pass account info through responses. No snapshot calls.
- **Update net_worth router**: remove history endpoint entirely. Keep only current.

**Dedup opportunities identified**:
- Copy `get_or_create_*` pattern once.
- Parser structure 90% identical (header normalize, csv.reader, error on line N).
- Preview/commit HTTP shape similar (file for preview, json commit with filename+rows).
- Registry pattern exact parallel.
- Avoid over-generalizing in v1 (txns vs holdings are different: append+dedupe vs full replace for accounts). Can later extract `import_base.py` if more brokers added.

### Net Worth History Removal (complete excision)
- Models: drop class.
- Schemas: remove NetWorthHistoryPoint + any refs.
- Services: delete 4 functions + calls. `compute_net_worth` stays pure current.
- Routers: delete history route + import.
- Migrations: DROP.
- **Every call site** (assets/holdings/liab routers + finance) : remove `record_...` lines.
- FinanceService: remove subject, observable, method, forkJoin args, refreshDerived that calls it, type DashboardLoadResult no longer includes it.
- Update all callers in dashboard/charts/portfolio? (portfolio doesn't use history).
- Components:
  - dashboard: remove history sub, filteredHistory, any uses in applyDateFilter/compute.
  - charts: remove netWorthChart canvas, netWorthRows logic, the "Net Worth Over Time" card entirely (or comment the section), remove overrideHistory input if only for that, update computeDerived + paint.
  - Remove from load/refresh paths.
- Types in model.ts: remove interface.
- Tests: update any that hit /history or assert snapshots. Add note that imports/muts no longer create history.
- Docs: scrub references. Update DATA_MODEL (no more snapshots), README (no history), FRONTEND.md if needed, ADDING_A_BANK... no change.
- Result: simpler, net worth always current (as already labeled in UI). "Break down by account" will live primarily in Portfolio (new groups) + enhanced NetWorthResponse for future reuse.

### Frontend Portfolio Import + Account Breakdown
- **Types** (model.ts): add Fidelity* interfaces (modeled on bank ones, adapted). Add optional `account_display?: string` to Holding.
- **FinanceService**: add:
  - `getBrokerageImports(): Observable<...>`
  - `previewFidelityImport(file): Observable<FidelityPreviewResult>`
  - `commitFidelityImport(slug, filename, rows): Observable<...>` (tap refresh holdings + netWorth)
- **PortfolioComponent** (the target page):
  - Add state: showImportModal, importStep, selectedSlug, file, preview, selectedKeys (use symbol+account as key since no dedupe), parsing/committing flags.
  - Header actions: keep "Add Holding" + "Refresh prices", **add "Import from Fidelity"** (secondary).
  - New method `openFidelityImportModal()`, `runFidelityPreview()`, `toggle...`, `commitFidelityImport()` (almost identical control flow to transactions, copy-paste with fidelity names).
  - On successful commit: toast, close, service will have refreshed holdings$.
  - **Breakdown by account**:
    - Group `holdings` into Map<account_display or 'Manual', Holding[]>.
    - Render sections or extra "Account" column + subtotals per group.
    - Summary card: total portfolio + perhaps small per-account pills or a mini breakdown table.
    - Update filtered/search to work across.
    - Use existing utils + new small util if needed.
  - Update table to include Account column when present.
  - Modal HTML modeled 1:1 after transactions import modal (reuse styles? or copy), but content: "This will **replace** current positions for accounts found in the CSV." Show account list in preview.
- No change to balance-sheet or tx pages (Fidelity holdings affect portfolio/NW only).
- Update any embedded charts if they passed history (dashboard passes overrides).

### Net Worth "Now" Display Improvements
- Enhance `NetWorthResponse` + compute to include:
  ```ts
  portfolio_breakdown?: Record<string, number>;  // "Fidelity ···Z21741448": 12345.67, "Manual": 2345, ...
  ```
- Dashboard hero: keep as-is (or add small "by account" hint/link to /portfolio). It already says "Current net worth".
- Portfolio page: becomes the rich view (per-account subtotals + total investments).
- Optional: small net worth summary card on portfolio page (pull netWorth$ or fetch).
- Remove all history-dependent "over time" language.

### Other Updates
- `migrations.py`, `database.py` (no logic change).
- `constants.py` unchanged (SYMBOL_PATTERN still good; fidelity symbols match).
- Proxy prefixes already cover /imports /holdings /net-worth (good; may add nothing).
- Docs:
  - Update root README "Data model" section (remove snapshots/history; describe Fidelity accounts in portfolio).
  - `docs/DATA_MODEL.md`: reflect new tables + "Fidelity imports replace holdings for account(s)".
  - `docs/FRONTEND.md`: update routes table? (no), add note under Portfolio: "Fidelity CSV import (replaces positions per account)".
  - `docs/ADDING_A_BANK_IMPORT.md`: perhaps rename or add sibling "ADDING_PORTFOLIO_IMPORT.md" but keep minimal; reference pattern.
  - ENGINEERING_BACKLOG: mark history removal as done if wanted.
- Tests: new `backend/tests/test_fidelity_import.py` (parser, preview shows accounts, commit replaces holdings for account, net worth recalcs correctly, manual holdings untouched).
  Update existing tests to not expect snapshots.
- Build/verify: `make test-backend`, `cd frontend && npx ng build --configuration development`.
- No new routes (import lives under existing /portfolio page + /imports/*).
- Error handling: same as bank (bad headers → 400 with line, unknown slug 404).
- For rows without cost basis (e.g. some SPAXX cash-like): set purchase_price = 1.0 or current? For now, if avg_cost <=0 use 0 (gain calc falls back), or document. Prefer using provided cost when present.
- Symbol normalization: upper + strip ** etc minimally (let market_data handle unknown?).

## 3. File Change Map (approximate, read before edit)
**Backend**:
- models.py (new Brokerage*, alter Holding, remove NetWorthSnapshot)
- schemas.py (new Fidelity* schemas, update HoldingResponse + NetWorthResponse, remove History)
- services/finance.py (big: new get_or_create_broker*, preview/commit fidelity, updated compute_*, strip all record/build history + snapshot logic)
- routers/imports.py (add fidelity routes)
- routers/net_worth.py (strip history)
- routers/holdings.py / assets.py / liabilities.py (remove record snapshot calls)
- import_registry.py (add brokerage configs + fns)
- import_parsers/fidelity.py (new)
- import_parsers/types.py (add ParsedFidelityRow)
- migrations.py (new tables + column + DROP snapshots)
- tests/ (update + new test_fidelity_import.py)

**Frontend**:
- models/transaction.model.ts (new Fidelity DTOs, update Holding, remove NetWorthHistoryPoint)
- services/finance.service.ts (remove history bits + load/refresh changes; add 3 fidelity import methods; update types)
- portfolio/portfolio.component.ts + .html (import modal + logic + account grouping in view + table column)
- dashboard/dashboard.component.ts + .html (strip history)
- charts/charts.component.ts + .html (remove net worth over time chart + related state/logic)
- (possibly small updates to utils if grouping helper)

**Docs + other**:
- README.md (data model)
- docs/DATA_MODEL.md, docs/FRONTEND.md, docs/ENGINEERING_BACKLOG.md
- AGENTS.md? (no unless conventions change)
- Update any spec files.

**No changes**: market_data, price cache, transactions (except if shared types), balance sheet, calendar, shared ui (reuse existing), core layout.

## 4. Implementation Phases (recommended order for safe iterative changes)
1. **Remove history completely** (self-contained, reduces surface).
   - Backend models/schemas/services/routers/migrations/tests.
   - FE service/models/dashboard/charts.
   - Verify no more /history, no snapshots created, current NW still works.
   - Update docs.
   - `make test-backend && ng build`

2. **Introduce brokerage account scaffolding + Holding FK** (no UI yet).
   - Models + migration.
   - get_or_create in finance.
   - Update HoldingResponse + holding_to_response + list/create paths (nullable).
   - Update compute_portfolio + NetWorthResponse with breakdown (populated for accounts when present; nulls → "Unassigned").
   - Existing data: manual holdings remain unassigned.
   - Tests for grouping.

3. **Add Fidelity parser + registry**.
   - New parser file + types.
   - Extend registry (no hardcodes).
   - Unit test parser with provided CSV sample.

4. **Add preview/commit logic + API**.
   - In services/finance.py the two big fns (preview builds response with accounts/rows; commit does delete-per-account then insert).
   - Schemas.
   - Routers/imports.py routes.
   - Update holdings list to return account_display.
   - Test: preview parses accounts correctly; commit replaces only fidelity accounts, leaves manual + other; NW total updates.

5. **Frontend wiring + Portfolio UI overhaul**.
   - Types + service methods (copy bank pattern exactly where possible).
   - Component: modal (copy structure from transactions), grouping logic (use Map or reduce in TS for accounts), table updates, summary.
   - After commit, holdings$ updates → UI refreshes groups.
   - Add "Import from Fidelity" + warning text.

6. **Polish + net worth now display**.
   - Enhance dashboard hero or add portfolio summary if valuable (e.g. "Portfolio by account" mini list).
   - Update any remaining references.
   - Full tests, build, manual import test with provided CSV.
   - Docs updates.

7. **Verification**:
   - Existing manual portfolio flows unchanged.
   - Bank import untouched.
   - Net worth calc correct post-import.
   - Multiple accounts in one CSV → multiple accounts created + grouped.
   - Re-import same file → resets to same positions.
   - Prices still fetched via market_data for MV.

## 5. Risks / Tradeoffs / Dedup Notes
- **Model change**: Adding FK to holdings is breaking for raw SQL but safe via migration + nullable. Old holdings = unassigned/manual.
- **Purchase date/cost for imported**: Use average cost basis as purchase_price, purchase_date = import date. Gain % will be vs average cost (common for brokers). Fallback still works. Acceptable; future enhancement for lots.
- **Duplication in FE**: Import modal logic will be ~70% duplicate between transactions and portfolio. Acceptable for now (different domains, different row types, replace vs select-new). Later: extract shared ImportPreviewComponent if 3+ importers.
- **Registry duplication**: Parallel BANK vs BROKERAGE dicts. Good for type safety. If future more, extract base ImportRegistry<T>.
- **"Reset" UX**: Explicit warning + "replaces" language. Preview can list "Accounts that will be reset: ...".
- **No hardcodes**: All via "fidelity" slug in registry, account_mask from CSV "Account Number", label built dynamically like banks.
- **History removal impact**: Charts lose one panel → cleaner? Portfolio allocation + tx charts remain. Dashboard simpler.
- **Testing**: Must assert replace semantics + that non-fidelity holdings survive.
- **Data loss on reset**: By design for "reset existing fidelity positions".
- Follow AGENTS: after any edit, re-read the changed router/service/component before next.

## 6. Post-Implementation Checklist (must do)
- [ ] Read affected router (imports/holdings/net_worth), service (finance.py), Angular portfolio + dashboard + charts + finance.service before/during edits.
- [ ] Update schemas + FinanceService + TS models together.
- [ ] Update README.md data model + docs/FRONTEND.md.
- [ ] `make test-backend`
- [ ] `cd frontend && npx ng build --configuration development`
- [ ] Manual test: upload provided CSV via new UI; verify accounts appear grouped in portfolio; NW total matches (sum of current values from CSV + market later); re-import resets.
- [ ] Verify manual add holding still works (unassigned or "Manual" bucket).
- [ ] No snapshot table left in DB after reset-db + start.
- [ ] Update any backlog/docs references.
- [ ] No hard-coded "fidelity" except in registry entry.

This plan was derived from exhaustive read of all source files (models, every router, full services/finance + market, all FE feature components + service + models, parsers, tests, docs, proxy, etc).

## Appendix: Sample Fidelity CSV Handling Notes (from user input)
- 3 accounts: Z21741448 (Individual), 262307889 (ROTH IRA), 86233 (SPACEX 401(K))
- Symbols include SPAXX**, GLD, GOOG, VOOG, VXUS, VOO, VT, VTI, VYM, target date funds (92202V138 etc), DFCEX, DFSVX.
- Some rows have empty Quantity/Current Value? (cash like), Cost Basis empty in some.
- Ignore disclaimer + "Date downloaded".
- Focus columns: Account Number, Account Name, Symbol, Quantity, Average Cost Basis (or Cost Basis Total), Current Value (but ignore for pricing — use live).

Next step after review: implement phase by phase with subagent-assisted checks.

## 7. Multi-Agent Audit Results (2026-06-23)

Three specialized reviewer subagents were spawned (parallel). Each was instructed to **read the plan first**, then perform exhaustive reads/greps of the *entire* relevant codebase sections (listed in calls), cross-reference AGENTS.md/domain rules, and return structured feedback with evidence, feasibility rating, and concrete recs.

### Reviewer 1: Backend Data Model + Services + NW invariants
**Verdict**: APPROVE WITH CHANGES. Feasibility 9/10.
- Strongly validates mirroring of Bank/BankAccount pattern for new Brokerage* tables + nullable FK on holdings.
- Snapshot removal complete and safe (current compute_* untouched; all call sites identified in routers/services/FE).
- "Replace" logic for Fidelity accounts preserves NW rules (manuals NULL survive; no snapshot on import).
- Dedup: extract get_or_create + label helpers in finance.py (copy bank ~lines 192-253).
- Missed files flagged: test_api.py (net worth history test), finance.service.spec.ts, certain HTMLs, compute_portfolio_as_of dead code.
- Recs: explicit migration asserts for DROP + NULL backfill="Manual"; update AGENTS.md domain rules (snapshots bullet); prune dead code; composite keys in preview.
- Evidence from full reads of models/schemas/finance/migrations/routers/parsers/app/tests + greps.

### Reviewer 2: Frontend + State + Components
**Verdict**: APPROVE.
- Plan correctly identifies all history sites (service loadDashboard + subjects + refresh, dashboard combineLatest + filtered + override, charts netWorthChart + overrideHistory + paint).
- Fidelity import in portfolio: copy modal flow from transactions is appropriate (different semantics: replace vs dedupe).
- For "break down by account": rich view in /portfolio (groups + subtotals + Account col); keep dashboard hero simple (current 3-item + link to portfolio). Add `portfolio_breakdown` to NetWorth model optionally.
- Duplication acceptable for v1 with comment; OnPush + FinanceService updates respected (no sig breaks without caller fixes).
- Recs: update service.spec expectations; remove overrideHistory pass + net worth card from charts; add account_display to Holding TS interface.
- Read all portfolio, dashboard, charts, finance.service, models, tx import parts, utils, proxy/envs.

### Reviewer 3: Import System + Dedup + AGENTS Compliance
**Verdict**: REVISE (import section) then APPROVE overall.
- Bank pattern reuse excellent (parser modeled 1:1, registry parallel, separate schemas for domain split, no hardcodes).
- Strong dedup suggestions (implement now):
  - `import_parsers/common.py`: normalize_headers, read_csv, parse_float (used by capital_one + fidelity).
  - Shared `make_account_label(provider, mask)` in finance.py.
  - Registry `_serialize_configs` helper.
  - Later small `import.util.ts` (not full component yet).
- **Critical AGENTS/docs sync**: Plan must explicitly update AGENTS.md (domain rules snapshot bullet + transactions section) + DATA_MODEL.md + README because removing the feature changes documented behavior. Plan's "update docs" was slightly under-specified here.
- Other: extend imports.py, keep parallel for type safety, test replace leaves manuals.
- Ran full backend tests (still pass pre-change), git clean checks.
- Evidence: full reads of import_registry/parsers/finance/routers/imports, tx component, AGENTS, ADDING_*, DATA_MODEL, tests.

**Overall synthesis**: Plan is solid, pattern-faithful, and safe. Proceed with phases (history removal first). Incorporate dedup extracts + AGENTS.md update + extra file reads before edits. No blockers to NW invariants or conventions.

**Actions taken post-audit**:
- This section added to plan.
- Additional flagged files read before any code changes (test_api.py, finance.service.spec.ts, dashboard/charts/portfolio HTML snippets, AGENTS domain rules).
- Will implement common.py + shared label helper during backend work.
- Will update AGENTS.md domain rules section.

All subagent reviews performed read-only (no edits by agents).
