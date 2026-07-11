# Accessibility And Inclusive Interaction

## Current Findings

`STR-004` supplies focus-visible and reduced-motion foundations. `A11Y-001` through `A11Y-003` identify modal, navigation, and data-exploration risks.

## Target State

One dialog/sheet primitive traps and restores focus, has a name, reports errors, and supports safe Escape closing. Navigation uses links and route-heading focus. Sort headers are buttons with sort state. Every canvas chart has equivalent text and table data. Forms use linked errors and live status; visuals do not rely on color alone.

## Acceptance Criteria

At 200% and 400% zoom, primary journeys reflow without hidden action. Keyboard, VoiceOver, contrast, reduced-motion, reduced-transparency, coarse-pointer, and route-focus checks pass for `A11Y-001` through `A11Y-003`.

## Verification

Run the matrix in [acceptance criteria](../roadmap/acceptance-criteria.md) on dialogs, import, transactions, portfolio, planning, and administration.
