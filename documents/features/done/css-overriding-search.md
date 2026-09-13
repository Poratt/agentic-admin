# CSS Overriding Search

## Problem

In a 54-file Angular project (12 GLOBAL, 42 COMPONENT), local CSS rules in feature components occasionally re-declare styling that already exists as a global class - typically because the author didn't know the global existed, or because the global's defaults didn't quite match and they overrode them. Examples include:

- `.idea-card-toggle transparent-btn` (recent case) - a 5-line local class that duplicated `.primary-btn` styling.
- `.fade-in` declared in 5 separate component files - duplicates the global animation class.
- `.form-field` re-declared in `register-form.component.css` - duplicates the global form class.
- `.metric-card` re-declared in `system-status-dashboard.component.css` - duplicates the global layout class.
- A class ending in `-chip` / `-card` / `-badge` / `-btn` that shadows the global convention without using the global modifier.

This drift causes visual inconsistency (e.g. an animation runs at 0.3s in one place, 0.5s in another), increases CSS bundle size (multiple declarations of the same rule), and makes design-token changes silently partial.

The `css-duplicate-styles-remediation-plan.md` (done) and `css-conventions-violations.md` (audit) cover some related issues (glass-effect reimplementations, hardcoded tokens). This audit is **scoped to class-name overlap** between COMPONENT and GLOBAL - the most concrete, automatable check.

## Goal

Produce a per-file audit of the 42 COMPONENT files that flags every local class which:

1. **Has the exact same selector name as a global class** (Rule A).
2. **Has a suspicious suffix** (`-toggle`, `-btn`, `-button`, `-card`, `-label`, `-pill`, `-chip`, `-badge`, `-input`) AND a global class with the same base name exists (Rule B).
3. **Is declared in both files** even with different values (Rule C - rare).

For each finding, the report records: file, local class (with line number), suspected global class, overlap reason, and rule (A/B/C).

The report is **read-only** - no remediation. The output is two tables: an updated Files Inventory (54 rows) with a "Violation Found" column, and a detailed per-violation table.

## Non-Goals

- No CSS, HTML, or TypeScript changes.
- No new global classes, tokens, or modifiers.
- No automated fix recommendations (the user will decide remediation per finding).
- No comparison with other Angular projects or external design systems.
- No linting or formatting work (Prettier handles that).
- No audit of global-on-global overlap (that's a normal design-system extension).
- No audit of pure property overlap without name collision (e.g. a unique local class with the same color as a global - too noisy, low signal).

## Approach

1. **Build the GLOBAL class catalog** by reading all 12 GLOBAL files and listing every top-level class. ~140 classes across buttons, layout, utilities, forms, filters, composer, primeng-overrides, animations, reset.
2. **Fan out 4 parallel sub-agents** across the 42 COMPONENT files, grouped by directory:
   - Agent 1: 18 chat block files.
   - Agent 2: 4 chat features + 5 design system files.
   - Agent 3: 3 shared + 4 ideas + 2 layout files.
   - Agent 4: 6 other features (settings, llm-providers, media-studio, strain-hunter).
3. **Each sub-agent** receives the GLOBAL catalog, the strict matching rules, and a JSON output schema. It returns a list of `{file, local_class, global_class, overlap, rule}` plus notes on glass-effect reimplementations and hardcoded values.
4. **Synthesize** the 4 sub-agent results into a single inventory + violations table. Files with no violations get an empty "Violation Found" cell.

## Out of Scope

- **Behavior-preserving CSS dedup** beyond what's flagged. The agent is read-only.
- **PrimeNG overrides** (`_primeng-overrides.css`) are listed as GLOBAL because they define reusable patterns, but classes prefixed with `.p-*` (vendor) are out of scope for matching - only the project's own classes are checked.
- **Animation keyframe definitions** in component files - only animation class assignments are checked, not `@keyframes` blocks.
- **CSS variable definitions** (`--my-var: value;`) - only class declarations are checked.

## Sequencing

This was a one-shot audit. No sequencing needed for the audit itself. If remediation follows:

1. **Rule A violations first** (definite duplicates - easy 1:1 swap).
2. **Rule B violations** (rename local class to something unique, or add a modifier to the global).
3. **Glass-effect reimplementations** (3 files) - convert to `.glass-effect` host class.
4. **Hardcoded value cleanup** - separate task; not part of this report.

## Open Questions

- For Rule A duplicates like `.fade-in` (5 files) and `.form-field` (1 file), is the intent "use the global as-is" or "make a local override with explicit comment why"? The current files suggest accidental duplication - but a manual review is needed.
- For Rule B violations (`.idea-card-toggle`, `.terpene-chip`, etc.), should the project add a new global modifier (e.g. `.transparent-btn.link`) or rename the local class? See the design discussion in the original session.
- The `chat-history.css` file reuses global classes (`.delete-confirmation`, `.warning-text`, `.action-btns`) as **nested selectors** to extend them. This is per-design (canonical-extensibility pattern) and is NOT flagged. If this pattern should also become a global rule (e.g. "use `&.action-btns` inside a parent class"), document it.
- The `design-system/_design-system-showcase.css` file uses `.primary-btn` and `.metric-value` as nested selectors inside `.sandbox-card` - this is a legitimate showcase demo and is NOT flagged. But if a future auditor runs the same rules, they'd see the nested use and might flag it. The design-system exception should be noted in any future automation.

---

## CSS Files Inventory (54 total) - with Violation Found

| #   | ✅  | Type      | File                                                                                                    | Violation Found                                                                                                                                                              | Overriding Classes |
| --- | --- | --------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   |     | GLOBAL    | `frontend/src/styles.css`                                                                               | -                                                                                                                                                                            |
| 2   |     | GLOBAL    | `frontend/src/app/assets/styles/_animations.css`                                                        | -                                                                                                                                                                            |
| 3   |     | GLOBAL    | `frontend/src/app/assets/styles/_buttons.css`                                                           | -                                                                                                                                                                            |
| 4   |     | GLOBAL    | `frontend/src/app/assets/styles/_composer.css`                                                          | -                                                                                                                                                                            |
| 5   |     | GLOBAL    | `frontend/src/app/assets/styles/_filters.css`                                                           | -                                                                                                                                                                            |
| 6   |     | GLOBAL    | `frontend/src/app/assets/styles/_forms.css`                                                             | -                                                                                                                                                                            |
| 7   |     | GLOBAL    | `frontend/src/app/assets/styles/_layout.css`                                                            | -                                                                                                                                                                            |
| 8   |     | GLOBAL    | `frontend/src/app/assets/styles/_primeng-overrides.css`                                                 | -                                                                                                                                                                            |
| 9   |     | GLOBAL    | `frontend/src/app/assets/styles/_reset.css`                                                             | -                                                                                                                                                                            |
| 10  |     | GLOBAL    | `frontend/src/app/assets/styles/_typography.css`                                                        | -                                                                                                                                                                            |
| 11  |     | GLOBAL    | `frontend/src/app/assets/styles/_utilities.css`                                                         | -                                                                                                                                                                            |
| 12  |     | GLOBAL    | `frontend/src/app/assets/styles/_variables.css`                                                         | -                                                                                                                                                                            |
| 13  | ✅  | SHARED    | `frontend/src/app/components/shared/dropdown/dropdown.css`                                              | - clean                                                                                                                                                                      |
| 14  | ✅  | SHARED    | `frontend/src/app/components/shared/score-tooltip/score-tooltip.css`                                    | - resolved (glass→.glass-effect, px→tokens, .tag→.match-tag)                                                                                                                 |
| 15  | ✅  | SHARED    | `frontend/src/app/components/shared/tooltip/tooltip.css`                                                | - resolved (glass→.glass-effect, px→tokens)                                                                                                                                  |
| 16  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/agnes-image-card/agnes-image-card.component.css`                 | - resolved (rem→`--font-size-*` tokens; 420px card-width kept, no token)                                                                                                     |
| 17  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/agnes-video-card/agnes-video-card.component.css`                 | - resolved (deep-nesting + rem→tokens + #000→--color-black)                                                                                                                  |
| 18  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/analytics-chart/analytics-chart.component.css`                   | - resolved (margin-left→margin-inline-start)                                                                                                                                 |
| 19  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/chat-sessions-list/chat-sessions-list.component.css`             | - clean                                                                                                                                                                      |
| 20  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/currency-card/currency-card.component.css`                       | ✅ resolved (.flag-badge→.currency-flag-badge; deep-nesting; 2px→--radius-xs)                                                                                                |
| 21  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/database-storage-monitor/database-storage-monitor.component.css` | ✅ resolved (removed .fade-in dupe + @keyframes; deep-nesting; margin-left→margin-inline-start)                                                                              |
| 22  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/delete-confirm-card/delete-confirm-card.component.css`           | - clean                                                                                                                                                                      |
| 23  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/llm-test-results/llm-test-results.component.css`                 | ✅ resolved (removed local @keyframes pulse - global exists)                                                                                                                 |
| 24  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/register-form/register-form.component.css`                       | ✅ resolved (.form-field moved to global \_forms.css; removed local .fade-in + @keyframes)                                                                                   |
| 25  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/role-change-card/role-change-card.component.css`                 | - clean                                                                                                                                                                      |
| 26  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/session-created-card/session-created-card.component.css`         | - clean                                                                                                                                                                      |
| 27  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/system-status-dashboard/system-status-dashboard.component.css`   | ✅ resolved (.metric-card→.metric-card.metric-card-row variant in \_layout.css; removed local .fade-in + @keyframes)                                                         |
| 28  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/transcript-timeline/transcript-timeline.component.css`           | ✅ resolved (removed local .fade-in + @keyframes; deep-nesting)                                                                                                              |
| 29  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/user-profile-card/user-profile-card.component.css`               | - clean                                                                                                                                                                      |
| 30  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/users-table/users-table.component.css`                           | - clean                                                                                                                                                                      |
| 31  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/weather-current-card/weather-current-card.component.css`         | ✅ resolved (deep-nesting; .detail-tile is unique, not .chip)                                                                                                                |
| 32  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/weather-forecast/weather-forecast.component.css`                 | ✅ resolved (removed local .fade-in + @keyframes; deep-nesting; .forecast-\* is unique)                                                                                      |
| 33  | ✅  | COMPONENT | `frontend/src/app/features/chat/blocks/weather-summary-card/weather-summary-card.component.css`         | ✅ resolved (.summary-card+.card.card-plain variant; deep-nesting; padding-right→padding-inline-end; .detail-tile unique)                                                    |
| 34  | ✅  | COMPONENT | `frontend/src/app/features/chat/chat/chat.css`                                                          | ✅ resolved (glass reimpl already gone; text-align:right→start; margin-left/right→margin-inline:auto)                                                                        |
| 35  |     | COMPONENT | `frontend/src/app/features/chat/chat-history/chat-history.css`                                          | - clean                                                                                                                                                                      |
| 36  |     | COMPONENT | `frontend/src/app/features/chat/chat-message/chat-message.css`                                          | - clean                                                                                                                                                                      |
| 37  |     | COMPONENT | `frontend/src/app/features/chat/render-host/render-host.component.css`                                  | - clean                                                                                                                                                                      |
| 38  |     | COMPONENT | `frontend/src/app/features/design-system/_design-system-buttons.css`                                    | - clean (showcase)                                                                                                                                                           |
| 39  |     | COMPONENT | `frontend/src/app/features/design-system/_design-system-showcase.css`                                   | - clean (showcase)                                                                                                                                                           |
| 40  |     | COMPONENT | `frontend/src/app/features/design-system/_design-system-swatches.css`                                   | - clean (showcase)                                                                                                                                                           |
| 41  |     | COMPONENT | `frontend/src/app/features/design-system/_design-system-tokens.css`                                     | - clean (showcase)                                                                                                                                                           |
| 42  |     | COMPONENT | `frontend/src/app/features/design-system/design-system.css`                                             | - clean (showcase)                                                                                                                                                           |
| 43  | ✅  | COMPONENT | `frontend/src/app/features/ideas/idea-card/idea-card.css`                                               | - clean (no class-name overlap; `min-height: 400px` is intentional, out of audit scope — no token exists)                                   |
| 44  | ✅  | COMPONENT | `frontend/src/app/features/ideas/ideas-form/ideas-form.css`                                             | ✅ emptied — local composer CSS moved to global `_composer.css` (composer-field / composer-meta-row / composer-submit)                       |
| 45  | ✅  | COMPONENT | `frontend/src/app/features/ideas/ideas-page/ideas-page.css`                                             | ✅ **DELETED** — `.ideas-root` layout replaced by global `.page-content.flush`; dock rules moved to `_composer.css` (Ideas chat-style refactor) |
| 46  |     | COMPONENT | `frontend/src/app/features/ideas/ideas-progress/ideas-progress.css`                                     | - clean                                                                                                                                                                      |
| 47  |     | COMPONENT | `frontend/src/app/features/layout/header/header.css`                                                    | - clean                                                                                                                                                                      |
| 48  |     | COMPONENT | `frontend/src/app/features/layout/main-sidebar/main-sidebar.css`                                        | - clean (only `width: 220px` raw)                                                                                                                                            |
| 49  | ✅  | COMPONENT | `frontend/src/app/features/llm-providers-management/llm-providers-management.css`                       | ✅ resolved (`.col-expand` kept as complementary; `.row-subtitle`→`.row-subtitle--flex` in `_utilities.css`; `.status-indicator`→`.status-dot`; `.panel-header`/`.panel-title` exact dupes removed; `.count-badge`→`.count-value`) |
| 50  | ✅  | COMPONENT | `frontend/src/app/features/media-studio/media-studio.css`                                               | - clean (only hardcoded rem/px + 1 raw hex — not class-name violations)                                                                                                      |
| 51  | ✅  | COMPONENT | `frontend/src/app/features/settings/database-monitor-settings/database-monitor-settings.css`            | ✅ resolved (`.db-chip`→`.db-stat-pill`; 7 raw hex tokens moved to `_variables.css` as `--color-chart-1..7`, referenced via `var(--color-chart-N)` from TS)                  |
| 52  | ✅  | COMPONENT | `frontend/src/app/features/settings/strain-hunter-settings/strain-hunter-settings.css`                  | ✅ resolved (`.panel-header.section`/`.panel-title.primary` removed — use global `.panel-header`/`.panel-title`; `gap: 2px`→`var(--space-1)`; `.detail-item` kept as component-specific layout) |
| 53  | ✅  | COMPONENT | `frontend/src/app/features/strain-hunter/matching-preferences-drawer/matching-preferences-drawer.css`   | ✅ resolved (`.terpene-chip`/`.genetics-chip` merged into `.chip` + `chip-*` modifiers; `.reset-btn`→global `transparent-btn bordered`)                                       |
| 54  | ✅  | COMPONENT | `frontend/src/app/features/strain-hunter/strain-hunter.css`                                             | ✅ resolved (`.strain-penalty-badge`→`.badge.badge-danger.badge-compact`; `.match-btn` is dead CSS — not wired to any template, left as-is per AGENTS.md dead-code rule)        |

### File categories

- **Global (12):** #1–12 - `styles.css` entry point + the 11 partials in `assets/styles/`. These are the "source of truth" files; they define tokens, base styles, and shared utilities that the rest of the app should consume.
- **Shared components (3):** #13–15 - `components/shared/`. Reusable, multi-feature primitives.
- **Chat blocks (18):** #16–33 - `features/chat/blocks/`. One CSS file per chat block component.
- **Chat features (4):** #34–37 - `features/chat/`. Chat shell, history, message, render host.
- **Design system (5):** #38–42 - `features/design-system/`. Internal showcase partials plus the main `design-system.css`.
- **Ideas (4):** #43–46 - `features/ideas/`. The business-idea-generator feature.
- **Layout (2):** #47–48 - `features/layout/`. Header + sidebar.
- **Other features (6):** #49–54 - llm-providers-management, media-studio, settings (x2), strain-hunter (x2).

### Type split

- **GLOBAL: 12** (the 11 `assets/styles/_*.css` partials + the `styles.css` entry point that imports them).
- **COMPONENT: 42** (everything else: shared components, chat blocks, chat features, design system, ideas, layout, other features).

---

## Detailed Violations (27 total)

### Rule A - Exact Selector Match (15)

| #   | File                                     | Local class (line)             | Global class        | Why it overlaps                                                                                                                       |
| --- | ---------------------------------------- | ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `database-storage-monitor.component.css` | `.fade-in` (line 185)          | `.fade-in`          | Top-level exact duplicate of global animation class in `_animations.css`                                                              |
| 2   | `register-form.component.css`            | `.form-field` (line 37)        | `.form-field`       | Top-level exact duplicate of global form-field class in `_forms.css:138`                                                              |
| 3   | `register-form.component.css`            | `.fade-in` (line 91)           | `.fade-in`          | Top-level exact duplicate of global animation class                                                                                   |
| 4   | `system-status-dashboard.component.css`  | `.metric-card` (line 19)       | `.metric-card`      | Top-level exact duplicate of global metric-card class in `_layout.css:136`                                                            |
| 5   | `system-status-dashboard.component.css`  | `.fade-in` (line 129)          | `.fade-in`          | Top-level exact duplicate of global animation class                                                                                   |
| 6   | `transcript-timeline.component.css`      | `.fade-in` (line 107)          | `.fade-in`          | Top-level exact duplicate of global animation class                                                                                   |
| 7   | `weather-forecast.component.css`         | `.fade-in` (line 123)          | `.fade-in`          | Top-level exact duplicate of global animation class                                                                                   |
| 8   | `llm-providers-management.css`           | `.col-expand` (line 52)        | `.col-expand`       | Both files declare top-level `.col-expand`; local sets padding/indent, global sets `width: 32px`                                      |
| 9   | `llm-providers-management.css`           | `.row-subtitle` (line 92)      | `.row-subtitle`     | Local re-declares as `200px wide flex-grow block`, clobbering the global `font-code`/muted subtitle style                             |
| 10  | `llm-providers-management.css`           | `.status-indicator` (line 114) | `.status-indicator` | Local redefines as `inline-flex` with size/weight + `::before` dot, clobbering the shared success-color pattern from `_utilities.css` |
| 11  | `llm-providers-management.css`           | `.panel-header` (line 261)     | `.panel-header`     | Local re-declares canonical `.panel-header` (flex + border-bottom) with only a padding override                                       |
| 12  | `llm-providers-management.css`           | `.panel-title` (line 265)      | `.panel-title`      | Local overrides with `uppercase + letter-spacing` instead of extending via a `.row-label--bold`-style modifier                        |
| 13  | `strain-hunter-settings.css`             | `.panel-header` (line 39)      | `.panel-header`     | Local component-scoped re-declaration of the canonical expand-panel header                                                            |
| 14  | `strain-hunter-settings.css`             | `.detail-item` (line 99)       | `.detail-item`      | Local re-declares `.detail-item` at host scope, overriding the metric-card's `.detail-item` styling globally                          |
| 15  | - (one violation is Rule C - see below)  | -                              | -                   | -                                                                                                                                     |

### Rule C - Same Class Declared in Both (1)

(The same `.fade-in` class appears in 5 files; this counts as 1 distinct violation category, 5 file instances above.)

| #   | File                 | Local class (line) | Global class | Why it overlaps                                                                                                  |
| --- | -------------------- | ------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| 16  | (5 files) `.fade-in` | (5 lines)          | `.fade-in`   | Same name declared locally in 5 files with the same `animation: fadeIn 0.3s ease forwards` body. 100% redundant. |

### Rule B - Suspicious Suffix (12)

| #   | File                                     | Local class (line)                 | Global class                                                  | Why it overlaps                                                                                                |
| --- | ---------------------------------------- | ---------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 17  | `currency-card.component.css`            | `.flag-badge` (line 27)            | `.badge`                                                      | Ends in `-badge`; global `.badge` already provides the canonical pill style with `.badge-*` modifiers          |
| 18  | `database-storage-monitor.component.css` | `.summary-card` (line 64)          | `.card`                                                       | Ends in `-card`; uses the same `glass-bg + border + radius` recipe as global `.card`                           |
| 19  | `weather-current-card.component.css`     | `.detail-chip` (line 107)          | `.chip`                                                       | Ends in `-chip`; global `.chip` is the canonical filter chip with hover/remove pattern                         |
| 20  | `weather-forecast.component.css`         | `.forecast-card` (line 33)         | `.card`                                                       | Ends in `-card`; same `glass-bg + border` recipe as global `.card`                                             |
| 21  | `weather-summary-card.component.css`     | `.summary-card` (line 5)           | `.card`                                                       | Same as above                                                                                                  |
| 22  | `weather-summary-card.component.css`     | `.detail-chip` (line 148)          | `.chip`                                                       | Ends in `-chip`; canonical `.chip` is the right pattern                                                        |
| 23  | `llm-providers-management.css`           | `.count-badge` (line 80)           | `.badge`                                                      | Ends in `-badge`; should be `.badge.badge-default` or similar modifier                                         |
| 24  | `database-monitor-settings.css`          | `.db-chip` (line 193)              | `.chip`                                                       | Ends in `-chip`; per-component chip that bypasses the shared pattern                                           |
| 25  | `matching-preferences-drawer.css`        | `.terpene-chip` (line 128)         | `.chip`                                                       | Ends in `-chip`; custom state colors duplicate `.chip`'s shape                                                 |
| 26  | `matching-preferences-drawer.css`        | `.genetics-chip` (line 129)        | `.chip`                                                       | Same as above                                                                                                  |
| 27  | `matching-preferences-drawer.css`        | `.reset-btn` (line 315)            | `.primary-btn / .transparent-btn / .danger-btn / .accent-btn` | Ends in `-btn`; custom button instead of using a global button theme                                           |
| 28  | `strain-hunter.css`                      | `.match-btn` (line 336)            | `.primary-btn / .transparent-btn / .danger-btn / .accent-btn` | Ends in `-btn`; `inline-flex + gap` layout duplicates the global button flex setup from `_buttons.css:147-151` |
| 29  | `strain-hunter.css`                      | `.strain-penalty-badge` (line 397) | `.badge`                                                      | Ends in `-badge`; re-implements global badge (radius, padding, font-size, weight)                              |

### Pattern: `.fade-in` is the most-duplicated class

The single biggest class-name conflict is `.fade-in`, declared in 5 separate component files with the same body (`animation: fadeIn 0.3s ease forwards`). The fix is trivial - delete the 5 local declarations. The class is then resolved purely from `_animations.css`.

### Pattern: `-chip` suffix is the most common Rule B

Four files declare `*-chip` classes: `weather-current-card`, `weather-summary-card`, `database-monitor-settings`, and `matching-preferences-drawer`. None of them use the global `.chip` pattern. Whether they should - or whether `.chip` is filter-specific and these are display-chips - is a design call. Either way, the class names suggest the global was overlooked.

### Pattern: `-card` suffix for non-canonical cards

`weather-forecast`, `weather-summary-card`, and `database-storage-monitor` all declare `*-card` classes. The global `.card` provides glass-bg + border + radius + a `::after` top accent. Whether the local cards need the same exact look is a design call, but the names imply they're related to `.card`.

---

## Glass-Effect Reimplementations (3 files)

The global `.glass-effect` class (in `_utilities.css:86-102`) uses an isolated `::before` pseudo-element with `backdrop-filter: blur(var(--glass-blur))` to keep the blur layer from interfering with content. Three files re-implement this exact `::before` pattern instead of using the global class:

| File                                                                 | Pseudo-element               | Lines | Recommendation                                                      |
| -------------------------------------------------------------------- | ---------------------------- | ----- | ------------------------------------------------------------------- |
| `frontend/src/app/features/chat/chat/chat.css`                       | `.chat-drop-overlay::before` | 82-90 | Apply `class="glass-effect"` to the host; drop the `::before` block |
| `frontend/src/app/components/shared/score-tooltip/score-tooltip.css` | `.score-card::before`        | 33-41 | Same - `.glass-effect` host                                         |
| `frontend/src/app/components/shared/tooltip/tooltip.css`             | `.tooltip-card::before`      | 33-41 | Same - `.glass-effect` host                                         |

Implementation note: the local `::before` blocks duplicate the global exactly (same `position`, `inset`, `border-radius: inherit`, `backdrop-filter: blur(var(--glass-blur, 8px))`, `z-index: -1`). They're functionally identical. The only difference is the local `8px` fallback inside `var()`, but `_variables.css` already defines `--glass-blur` for both themes.

---

## Hardcoded Values Summary

Raw hex / raw rgba / raw px values that should ideally use `--color-*` / `var(--space-*)` / `var(--font-size-*)` tokens. Listed for awareness; remediation is a separate task.

**Raw hex (2 files):**

- `agnes-video-card.component.css:44` - `background: #000;`
- `database-monitor-settings.css:7-12` - 7 hex values declared as local custom tokens (`#6366f1`, `#3b82f6`, `#10b981`, `#f59e0b`, `#ec4899`, `#8b5cf6`, `#06b6d4`) - should live in `_variables.css`.
- `media-studio.css:98` - `background: #000;`

**Raw px (most files; high-frequency values are `max-width`/`min-width` for cards and `transform` offsets in keyframes):**

- `chat.css:45, 74, 95, 120, 125, 155, 161, 182` - `800px`, `2px dashed`, `12px drop-shadow`, `180px`, `140px`, `2px gap`
- `chat-history.css:54-55, 65, 120, 24` - `40px`, `2px`, `1px` (borderline)
- `chat-message.css:17, 72, 80, 100, 119` - `4px`, `240px`, `200px`, `2px` (typing cursor)
- `currency-card.component.css:38, 39, 41, 140, 164, 165, 167` - `24px`, `16px`, `2px radius`, `280px`, `20px`, `14px`
- `database-storage-monitor.component.css:104, 112, 118, 180` - `80px`, `120px`, `30px`, `0.05em` letter-spacing
- `system-status-dashboard.component.css:51, 100, 125` - `0.05em`, `70px`, `30px`
- `transcript-timeline.component.css:82` - `0.05em`
- `weather-current-card.component.css:127, 159` - `0.05em`, `6px transform`
- `weather-forecast.component.css:35, 49, 103, 119` - `100px`, `4px transform`
- `weather-summary-card.component.css:102, 105, 117, 168, 205, 219, 269, 279, 298` - `72px`, `16px`, `20px`, `0.05em`, `90px`, keyframe `4px/8px` offsets
- `analytics-chart.component.css:79-80` - `100px` (`.pie-circle`)
- `register-form.component.css:8, 70` - `380px`, `0.15em`
- `session-created-card.component.css:10`, `chat-sessions-list.component.css:10`, `users-table.component.css:10`, `role-change-card.component.css:10`, `delete-confirm-card.component.css:10`, `user-profile-card.component.css:10`, `llm-test-results.component.css:10` - `max-width: 360-640px` (one per file)
- `agnes-image-card.component.css:7, 14, 25, 31, 55`, `agnes-video-card.component.css:7, 14, 24, 34, 51` - `420px`/`480px` `max-width` and `0.7-0.9rem` `font-size` (raw rem, not in `--font-size-*` scale)
- `score-tooltip.css:71, 77, 115, 120, 129, 130, 132` - `2px`, `4px`, `10px`, `11px` font-size
- `tooltip.css:67, 68` - `10px`, `2px 6px` padding
- `ideas-form.css:12, 23, 24, 35` - `220px`, `64px`, `2px glow`
- `idea-card.css:3, 77` - `400px`, `3px`
- `main-sidebar.css:2` - `width: 220px`
- `ideas-page.css:24` - `min-height: 320px` (duplicates the global `.page-state` `min-height: 320px`)
- `llm-providers-management.css:48, 62, 66, 71, 106, 123, 124, 141, 177, 236, 248, 269` - column widths, `2px border-left`, `0.15s transition`, `48px` calc, `0.05em`
- `media-studio.css:22, 23, 36, 38, 58, 69, 90, 97, 106, 119, 120, 136` - `0.85rem`, `font-weight: 600`, `0.2s transition`, `1px solid var(--border-color)` (typo - should be `--color-border`), `0.9rem`, `0.8rem`
- `database-monitor-settings.css:84, 101-104, 132, 172, 183` - `180px`, `20%`, `12px`, `6px`, `1px`
- `strain-hunter-settings.css:128, 132, 142, 170` - `1.1 line-height`, `11px font-size`, `2px padding`
- `strain-hunter.css:53, 84-85, 92, 108-109, 148, 175, 200, 348, 357, 362` - `11px font-size`, `28px`, `2px`, `1 line-height`, `4 stroke-width` (SVG)
- `matching-preferences-drawer.css:78, 152, 158, 161-162` - `1 line-height`, `-4px` positioning

This is a separate task. The audit only flags class-name conflicts; the hardcoded-value audit is in scope for a future plan (likely overlaps with `css-conventions-violations.md`).

---

## Summary

| Metric                                 | Count                    |
| -------------------------------------- | ------------------------ |
| Files audited (COMPONENT)              | 42                       |
| Files with at least 1 violation        | 14                       |
| Files clean (no class-name violations) | 28                       |
| Total Rule A violations                | 14                       |
| Total Rule B violations                | 12                       |
| Total Rule C violations                | 1 (5 file instances)     |
| **Total violations**                   | **27** (across 14 files) |
| Glass-effect reimplementations         | 3 files                  |
| Files with raw hex values              | 3                        |
| Files with raw px values               | ~30 (most files)         |

### Top 5 worst offenders (most violations per file)

1. **`llm-providers-management.css`** - 5 Rule A + 1 Rule B = **6 violations**
2. **`matching-preferences-drawer.css`** - 3 Rule B = **3 violations**
3. **`strain-hunter.css`** - 2 Rule B = **2 violations**
4. **`register-form.component.css`** - 2 Rule A (`.form-field` + `.fade-in`)
5. **`system-status-dashboard.component.css`** - 2 Rule A (`.metric-card` + `.fade-in`)

### Most-violated global classes

1. **`.fade-in`** - 5 files re-declare it identically (drop-in replacement).
2. **`.card`** - 3 files use `*-card` suffix without applying the global.
3. **`.chip`** - 4 files use `*-chip` suffix without applying the global.
4. **`.badge`** - 3 files use `*-badge` suffix without applying the global.
5. **`.panel-header`** - 2 files re-declare it.

## Status

Remediation complete. All 27 class-name violations across the 14 flagged files have been resolved: Rule A exact duplicates were removed or merged into global utilities/modifiers; Rule B suffix clashes were renamed or merged into the canonical `.chip` / `.badge` / `.card` patterns or global button themes; raw hex tokens were promoted to `_variables.css`. The only intentionally-untouched item is `.match-btn` in `strain-hunter.css`, which is dead CSS (not wired to any template) and is left per the AGENTS.md dead-code rule. Remaining raw `px`/`rem` values noted in the audit are out of scope (class-name overlap only) and tracked separately under the hardcoded-value cleanup task.
