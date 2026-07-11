# Passwordless Migration Recovery Design

## Goal

Restore production without losing finance data and make migration `e8a4c7d2f910` safe for both clean and partially migrated SQLite databases.

## Root Cause

The migration adds several `users` columns before failing while attempting to create `uq_users_username` through a `user_sessions` batch operation. SQLite DDL is non-transactional in this deployment, so the failed migration leaves added columns in place while the Alembic revision remains at its previous value. Subsequent starts then fail on the first duplicate column.

## Recovery

Change the migration to inspect the live schema and add only missing columns, tables, indexes, and constraints. Create `uq_users_username` on `users`, not `user_sessions`. Preserve all existing rows and do not stamp the migration manually.

Before redeployment, create a timestamped copy of the production SQLite database. The normal deployment will rebuild the API image and rerun Alembic. A successful migration records revision `e8a4c7d2f910` and allows the API health check to pass.

## Verification

Add a regression test that constructs the observed partial state: passwordless columns and new auth tables exist, `migration_only` and the username uniqueness constraint do not, and Alembic still reports the previous revision. Verify upgrading to head succeeds, preserves data, creates missing objects, and a second upgrade is a no-op.

Run the backend migration tests, build the production API image, test the migration against a copy of production data, push the fix to `main`, and verify the deployed API and web containers plus the live health endpoint.

## Rollback

If deployment fails, retain the timestamped database backup and inspect the new failure before restoring. Restore only when the failed migration has modified production incompatibly; do not discard newer production data unnecessarily.
