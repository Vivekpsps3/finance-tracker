# Responsive And Apple-Platform Adaptation

## Current Findings

`STR-004` has safe-area foundations. `PLAT-001` and `PLAT-002` require explicit device behavior.

## Target State

At 390x844 and 844x390 use labeled compact navigation and list-cell alternatives. At 768x1024 and 1024x768 support iPad split-view and software keyboards. At 1280x800, 1440x900, and 1728x1117 retain macOS-like sidebar and dense table efficiency. Respect safe areas, Stage Manager/Split View, coarse pointers, keyboard, VoiceOver, system appearance, and locale.

## Acceptance Criteria

`PLAT-001` documents and tests navigation, tables, dialogs, charts, and touch targets for every viewport. `PLAT-002` passes Safari metadata, contrast, transparency, and locale review.

## Verification

Use physical or emulated iPhone, iPad, and desktop Safari/Chromium matrix with [accessibility](accessibility.md).

## Shipped baseline (2026-07-11)

- Labeled compact top nav at ≤768px (icon + short labels).
- System appearance via `prefers-color-scheme` light tokens; reduced transparency/contrast hooks.
- `formatMoney` / `formatDate` locale helpers; system typography; manifest description + maskable SVG.
- Viewport matrix documented in `docs/FRONTEND.md`. List-cell table alternatives remain a follow-up.
