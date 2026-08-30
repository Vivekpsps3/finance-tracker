# Organization And User Story Schema

Date: 2026-08-30

## Summary

Freeze a four-plane organization schema and a lean user-story schema, then align
the app’s information architecture to it. This does not add finance features and
does not change data-plane invariants.

Deliverables: GSD planning artifacts (PROJECT.md, REQUIREMENTS.md, ROADMAP.md)
and a later UI IA pass (nav, titles, tutorial, source badges).

## Approved Decisions

- Organization describes both planning and product IA.
- Stories and phases are keyed to write epics (one epic per plane).
- Overview is a read-only cockpit, not a fifth write epic.
- AUTH and VAULT are support, not money planes.
- Story fields: ID, want, plane, writes, must not, accept. No role. No so-that.
- Milestone is two phases: freeze stories, then align app IA.
- Stories stay grouped by plane in REQUIREMENTS.md.

## Organization Schema

### Write epics

| Epic | Plane | May write | Must not |
|------|-------|-----------|----------|
| **NW** | Net Worth | `assets`, `liabilities`, `holdings` (and price refresh) | Treat transactions or recurring cashflow as net worth |
| **ACT** | Activity | `transactions` (manual + bank CSV) | Change net worth |
| **CF** | Cashflow | `job_incomes`, `fixed_expenses`, `subscriptions` | Change net worth |
| **PLAN** | Planning | MC presets, encrypted `stock_lab_scenarios` | Mutate assets, liabilities, holdings, or transactions |

### Read cockpit

| Surface | Role |
|---------|------|
| **Overview** (`/`) | Read-only composition of current NW + period ACT/CF signals. Writes none. |

### Support (not money)

| Epic | Role |
|------|------|
| **AUTH** | Passwordless session, invitations, admin users |
| **VAULT** | Browser-owned vault setup/unlock/lock; ciphertext only on the server |

### App IA (Phase 2)

Keep the existing top groups. Make the plane unmistakable:

| Nav group | Epic | Rule |
|-----------|------|------|
| Overview | read | Label as current picture, not an editor |
| Net Worth | NW | Balance sheet + portfolio only |
| Activity | ACT | Ledger + calendar only |
| Cashflow | CF | Recurring money only |
| Planning | PLAN | Speculative only |
| Account menu | AUTH/VAULT | Lock vault, logout, admin |

Page titles, tutorial copy, and `ui-source-badge` kinds (`observed` / `scheduled` /
`combined` / `scenario`) must name the plane in the same words as this table.

## User Story Schema

```
- [ ] **{PLANE}-{NN}**: {one capability}
      Plane: {NW|ACT|CF|PLAN|AUTH|VAULT|OVERVIEW}
      Writes: {collections or none}
      Must not: {invariant}
      Accept:
      - {testable check}
      - {testable check}
```

Rules:

- One capability per story. No “and” that crosses planes.
- `Writes: none` for Overview and any read-only story.
- `Must not` is required on every money-plane story.
- IDs are stable. Do not reuse a retired ID.

## v1 Stories

### Validated (already shipped)

#### Overview

- [x] **OVERVIEW-01**: See current net worth and period cashflow on one page
      Plane: OVERVIEW · Writes: none
      Must not: imply net worth is a transaction rollup
      Accept: hero is current balance-sheet total; period filter does not change that total

#### NW

- [x] **NW-01**: Maintain manual assets and liabilities
      Plane: NW · Writes: assets, liabilities
      Must not: create transactions or change holdings
      Accept: CRUD updates current net worth; as-of date visible

- [x] **NW-02**: Maintain portfolio holdings, including Fidelity CSV replace-import
      Plane: NW · Writes: holdings
      Must not: write transactions or manual cash assets
      Accept: market value is in net worth; brokerage cash vs manual cash can double-count and is documented

- [x] **NW-03**: Refresh portfolio prices on demand
      Plane: NW · Writes: none (quotes are public cache)
      Must not: send shares, values, or account details to the server
      Accept: only ticker symbols leave the browser; values stay encrypted

#### ACT

- [x] **ACT-01**: Review and edit the transaction ledger
      Plane: ACT · Writes: transactions
      Must not: change net worth
      Accept: period income/spend/net update; net worth unchanged

- [x] **ACT-02**: Import bank CSVs with duplicate preview
      Plane: ACT · Writes: transactions
      Must not: upload CSV plaintext to legacy import routes in vault mode
      Accept: Capital One, Chase, Amex, Citi, X Money; duplicates skipped on commit

- [x] **ACT-03**: See activity on a calendar
      Plane: ACT · Writes: none
      Must not: change net worth
      Accept: monthly spend/income/net from the ledger only

#### CF

- [x] **CF-01**: Maintain job income configurations
      Plane: CF · Writes: job_incomes
      Must not: change net worth
      Accept: monthly/annual figures on the income page; feeds cashflow summary

- [x] **CF-02**: Maintain bills (fixed expenses)
      Plane: CF · Writes: fixed_expenses
      Must not: change net worth
      Accept: rent/utilities-style items live here, not as a required transaction

- [x] **CF-03**: Maintain subscriptions
      Plane: CF · Writes: subscriptions
      Must not: change net worth
      Accept: monthly/annual totals and next bills

#### PLAN

- [x] **PLAN-01**: Run Monte Carlo from named input presets
      Plane: PLAN · Writes: planning presets only
      Must not: mutate assets, liabilities, holdings, or transactions
      Accept: fan chart is ephemeral; presets save inputs, not runs

- [x] **PLAN-02**: View client-side investment insights
      Plane: PLAN · Writes: none
      Must not: persist speculative values as net worth
      Accept: growth/withdrawal figures stay on the page

- [x] **PLAN-03**: Use Stock Lab with encrypted scenarios
      Plane: PLAN · Writes: stock_lab_scenarios
      Must not: convert a scenario into holdings
      Accept: tickers may go to market research; shares and assumptions stay encrypted

#### AUTH / VAULT

- [x] **AUTH-01**: Sign in passwordless with username + vault passphrase
      Plane: AUTH · Writes: sessions
      Must not: send the passphrase or private key to the server
      Accept: challenge-signature login; legacy password path is migration-only

- [x] **VAULT-01**: Set up, unlock, and lock the finance vault
      Plane: VAULT · Writes: ciphertext records
      Must not: store finance plaintext on the server
      Accept: shell routes require unlock; lock clears decrypted memory

- [x] **AUTH-02**: Admin can invite and manage users, not recover vaults
      Plane: AUTH · Writes: users, invitations
      Must not: reset another user’s vault passphrase
      Accept: `/admin/users` exists; lost passphrase means lost data

### Active (this milestone)

- [ ] **OVERVIEW-02**: Overview chrome states it is a read-only picture
      Plane: OVERVIEW · Writes: none
      Must not: add edit affordances for other planes on the dashboard
      Accept: subtitle/tutorial say current truth vs period activity

- [ ] **IA-01**: Nav, page titles, and tutorial use the epic names above
      Plane: OVERVIEW · Writes: none
      Must not: rename planes to table names (e.g. “Holdings” as a top group)
      Accept: five groups remain; each group’s tooltip names the plane and the must-not

- [ ] **IA-02**: Source badges and page metrics name the plane
      Plane: OVERVIEW · Writes: none
      Must not: show a `combined` badge on a net-worth figure
      Accept: observed = NW, scheduled = CF, combined = ACT+CF period, scenario = PLAN

## Roadmap

### Phase 1: Freeze the schema

**Goal:** Planning docs match this spec.

**Success:**

1. PROJECT.md states the four write epics and Overview cockpit.
2. REQUIREMENTS.md lists every story above with the lean schema.
3. ROADMAP.md maps each active story to Phase 2; validated stories stay marked existing.

### Phase 2: Align app IA

**Goal:** A user can tell which plane they are in from the chrome.

**Stories:** OVERVIEW-02, IA-01, IA-02

**Success:**

1. Nav groups and tooltips match the IA table.
2. Tutorial steps are ordered by plane, not by table.
3. No net-worth control uses a combined or scenario badge.

## Out Of Scope

| Item | Why |
|------|-----|
| SimpleFIN | Later aggregation; CSV is enough now |
| Plaid | Not wanted |
| Household sharing | Auth exists; shared household is later |
| Tax document vault | Intentionally removed |
| Net worth history | Current-only by invariant |
| New finance features | This milestone is schema + IA only |
| Remote webfonts | System stack stays |

## Implementation Notes

- Prefer copy and badge changes over route moves.
- Do not merge or split routes unless a label cannot make the plane clear.
- Keep `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md` as the formula source of truth; this spec only names how we organize work and UI around those formulas.

---

*Spec: 2026-08-30 after organization/user-story design*
