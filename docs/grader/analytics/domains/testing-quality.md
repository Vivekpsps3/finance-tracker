# Testing And Quality

## Current Findings

Focused unit and migration tests exist, but `TEST-001` requires a complete quality matrix and `BE-002` supplies the migration gate.

## Target State

Fast checks cover formatting, units, and static paths. Finance checks cover formulas and source semantics. Security checks cover ciphertext boundaries and ticker disclosure. Full checks cover journeys, axe, responsive layouts, performance, migration generations, production build, Docker smoke, backup, and restore.

## Acceptance Criteria

`TEST-001` has named tiers, fixtures, owners, failure output, and CI gates. `BE-002` matrix includes legacy database and vault generations. Accessibility gates include dialog, charts, sorting, zoom, and route focus.

## Verification

Run controlled regression fixtures and retain CI evidence.
