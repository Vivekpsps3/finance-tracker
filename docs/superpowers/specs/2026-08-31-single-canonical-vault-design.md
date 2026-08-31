# Single Canonical Vault

Date: 2026-08-31
Status: Approved
Scope: `apps/me` backend, Dockerfile, compose, .env(.example), deploy workflow, docs, agent instructions, frontend strings, stale data dirs

## Problem

The me-app carries a "vault copy" concept and a chain of path indirection for the vault:

- `vault.py::copy_root()` resolves `VAULT_PATH` → legacy `VAULT_COPY_PATH` → relative `vault`.
- `agent.py` resolves `AGENT_CWD` → `VAULT_PATH` → `/data/vault`; the Dockerfile separately sets
  `AGENT_CWD=/data`.
- `docker-compose.yml` passes `VAULT_PATH` and `AGENT_CWD` env vars and mounts
  `${ME_VAULT_DIR:-./data/me-vault}:/data/vault`, with `ME_VAULT_DIR` also declared in `.env`,
  `.env.example`, `deploy.yml`, and `DEPLOY.md`.
- `data/me/AGENTS.md` tells the pi agent "Vault copy is /data/vault-copy", conflicting with the
  system prompt; session logs show the agent confused by the two instructions.
- Two frontend strings say "vault copy"; stale empty dirs `data/me/vault` and `data/me/vault-copy`
  remain on the host.

## Decision

The vault is `/home/vivek/Deployments/Vault` — one literal path, hardcoded everywhere, host and
container alike (bind mount at the identical path). No env vars, no fallbacks, no aliases.

## Changes

1. **`apps/me/backend/vault.py`**
   - `copy_root()` → `vault_root()` returning `Path("/home/vivek/Deployments/Vault")`
     (mkdir parents on first use). No env reads.
   - Error message "path escapes copy root" → "path escapes vault root".
   - Update callers: `rebuild()` (same file), `standing.py::load_bank`, `standing.py::apply`.
2. **`apps/me/backend/agent.py`**
   - `CWD = Path("/home/vivek/Deployments/Vault")`; drop the `AGENT_CWD`/`VAULT_PATH` chain.
   - SYSTEM prompt: vault path updated; drop the "No SpaceX or company content." line.
3. **`apps/me/Dockerfile`** — delete `ENV AGENT_CWD=/data`.
4. **`docker-compose.yml`** — delete the `VAULT_PATH` and `AGENT_CWD` env entries; mount becomes
   `- /home/vivek/Deployments/Vault:/home/vivek/Deployments/Vault`.
5. **`.env` and `.env.example`** — delete the `ME_VAULT_DIR` lines.
6. **`.github/workflows/deploy.yml`** — remove `"$ME_VAULT_DIR"` from the mkdir list.
7. **`docs/DEPLOY.md`** — remove `$ME_VAULT_DIR` from the create-directories step.
8. **Agent instructions**
   - `data/me/AGENTS.md`: rewrite — vault is `/home/vivek/Deployments/Vault`, read and write it;
     inbox notes go under `Vault/inbox/`. Drop the vault-copy and SpaceX lines.
   - Delete stale `data/me/pi/AGENTS.md` (generated once by `bootstrap()`); it regenerates from the
     new SYSTEM prompt on next agent run.
   - `standing.py` `REFUSE_RE` / `REFUSE` (server-side wall-answer refusal) is application logic,
     not an AGENTS.md file — kept as-is per user decision.
9. **Frontend** — `dossier.component.ts`: "Not in the vault copy." → "Not in the vault.";
   `memory.component.ts`: "Add an era span in the vault copy, then Rebuild." → "…in the vault…".
   Rebuild `dist` (checked in).
10. **Filesystem**
    - `mkdir -p /home/vivek/Deployments/Vault` owned by `vivek` before first compose run (otherwise
      Docker creates it root-owned). Container writes land root-owned — same as today's
      `data/me/vault`; chown on the host if editing notes outside the container.
    - `rmdir data/me/vault data/me/vault-copy` (both empty).

## Out of scope

- Migrating vault content (both existing dirs are empty; nothing to move).
- The finance app's encrypted `UserVault` — unrelated despite the shared name.
- `standing.py` refusal logic (kept).
- Other env config (`SQLITE_PATH`, `PI_CODING_AGENT_DIR`, `OPENAI_*`, …) — service config, not
  vault pathing.

## Verification

- `make test-backend` passes.
- `cd apps/me/frontend && npx ng build` succeeds; dist no longer contains "vault copy".
- `docker compose --env-file .env --profile apps config` shows the me service mounting
  `/home/vivek/Deployments/Vault:/home/vivek/Deployments/Vault` and no `VAULT_PATH`/`AGENT_CWD`.
- Repo-wide grep for `VAULT_PATH|VAULT_COPY|AGENT_CWD|ME_VAULT|vault.copy|me-vault` returns only
  this spec; `grep -ri SpaceX apps/me data/me` returns only `standing.py`'s intentional refusal.
