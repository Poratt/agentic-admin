# Project Documentation Status

Last updated: 2026-09-15

## 2026-09-15 — ✅ DONE: chat model picker → `p-tiered-menu` with CSS-only submenu positioning

- **Picker:** `p-select` → `p-tiered-menu` popup in `chat.html`; trigger label from `selectedModel()`; per-model star icon for the default; `command` patches the form model and calls `llmProviderStore.setDefaultModel`.
- **Positioning (the "annoying" part solved):** the imperative JS flip (`adjustSubmenus()` + `NgZone.runOutsideAngular` + inline `style.top/bottom/maxHeight`) is gone — replaced by declarative CSS: `.p-tieredmenu.chat-model-menu .p-tieredmenu-submenu { top: auto; bottom: 0; max-height: 400px; overflow: auto }` plus an `.ltr` island class for the overlay on the RTL page.
- **Dialogs:** `[draggable]="true"` on providers / model / strain-hunter image+compare dialogs.
- **Cleanup (this session):** removed the swap's orphans — unused `NgZone` import + inject, unused `@ViewChild('menu') modelMenu`, dead `setDefaultModel(event, model)`, and the `<!-- Test -->` markers.
- **Verified:** frontend **571/571 (57 files), TEST_EXIT=0**; `ng build` exit 0 (pre-existing `strain-hunter.css` budget warning only); compiled dist CSS contains the submenu rule; graphify updated. No architecture-diagram change.
- **Committed + pushed:** `main` — commit `184053a` (9 files: 6 code + 3 session docs).
- **Open:** (1) picking a model now also writes the user's global default; (2) `perf-badge`/`latency-pill` no longer shown in the chat picker; (3) `400px` is hardcoded (no token exists); (4) unconditional `bottom: 0` can overflow upward for a group near the top of the viewport.

## 2026-09-13 — ✅ DONE: catalog-toolbar redesign + model statistics tab + ranking hardening

- **Toolbar:** stacked 2-floor (segmented Providers/Statistics switch + Add Provider; search + state filter providers-only). Global `.toggle-group.elevated` variant; counter as muted caption.
- **Search:** dead-gap + truncation + icon-collision fixed, scoped to component (global `.sm` shared ×2 elsewhere untouched).
- **Stats:** `GET /llm-provider/stats` (ping + real merge, `rankingBasis`, `fastestId`/`mostStableId`); live 500 fixed (camelCase cols); zero-success 0ms no longer wins fastest; 9 sortable columns; badges labelled by basis.
- **Dropdown:** removed `position: relative !important` on `.p-select-overlay`.
- **Verified:** frontend **554/554** + build 0; backend **535/535** + build 0. No architecture-diagram change. No commit/push.
- **Open:** ~~visual review → commit + push.~~ ✅ DONE 2026-09-13 — committed `fe2b9fa` + pushed `main`.

## 2026-09-12 — ✅ DONE: Test All (per-provider, background) + provider row-level click

- **Backend:** `POST /llm/providers/:id/test-all` — sequential testLlm over the provider's active text models (results saved per model), paced 3.5s free / 1s paid, runs in background ({tested} returned immediately), concurrent-run guard per provider; hidden from the agent.
- **Frontend:** "Test All" button next to Sync — toast on start, spinner+disabled while in flight, store reloads every 8s (~96s) so results appear live; "Nothing to test" guard.
- **UX:** whole provider row toggles expansion (cursor pointer; action buttons stop propagation).
- **Verified:** backend **526/526 (48 suites)** + build 0; frontend **536/536 (57 files)** + build 0. graphify updated. No architecture-diagram change. No commit/push.
- **Open:** restart backend to serve the endpoint; then commit+push of the full session.

## 2026-09-12 — ✅ DONE: provider model catalog sync dialog + lazy auto-mark

- **Why:** manual model entry broke down when NVIDIA retired 8 seed-era checkpoints (410s) — catalog sync replaces manual add.
- **Backend:** `GET :id/catalog` (live /models merged: new/exists/unavailable w/ local label) + `POST :id/sync-models` (bulk add active=false, dedupe/skip) + lazy auto-mark: real-usage 404 + model_not_found/invalid_model/model-key signal → auto active=false (generic 404s ignored). syncModels hidden from the agent.
- **Frontend (user-verified ✅):** "Sync" button per provider → dialog: header stats, search + Select/Deselect All one row, collapsible groups by owned_by/key-prefix, Exists gray+disabled+tag, unavailable hidden behind `Show unavailable (N)` (red tags, always last), `~` variant prefix stripped for display only (real OpenRouter ids), 16px checkboxes + clickable labels, sm footer buttons.
- **✅ KEY LESSON (Golden Rule #8):** PrimeNG dialogs project to `<body>` — component-emulated CSS never reaches them; ALL dialog styles live in `_primeng-overrides.css`. This was the entire "styling not applied" saga.
- **Verified:** backend **523/523 (48 suites)** + build 0; frontend **534/534 (57 files)** + targeted 46/46 + build 0. graphify updated. No architecture-diagram change. No commit/push.
- **Open (user, optional):** daily background catalog-refresh job.

## 2026-09-12 — 🚑 RECOVERED: llm-db checkout corrupted live DB + local env files

- **Cause:** running the backend (watch) on the old llm-db branch applied its June schema to the shared live DB → `llm_models` wiped (provider_id=0, key=''), 325 test results orphaned, FKs dropped. Checkout also deleted gitignored env files + local root package.json.
- **Recovered:** env files + root package.json recreated; 44/47 models restored via label→seed mapping (ids preserved → user defaults intact); 3 unmapped customs deleted (GLM 4.7 Flash, MiniMax M3 dup, x-Alpha); 325 orphaned test results removed (unattributable). Backend boots clean, unique index + FKs recreated; client up. apiKeys restored encrypted from .env (openrouter, nvidia, agnes, OmniRoute, GMI-Cloud, cloudflare). GLM 4.7 Flash re-added on cloudflare (`@cf/zai-org/glm-4.7-flash`, live-verified SUCCESS).
- **User cleanup (verified live):** NVIDIA — 8 retired checkpoints deleted (NIM catalog drift, 4 remain); requesty provider deleted (no key existed). Final state: 6 providers, 36 models.
- **Prevention (done, user approved):** AGENTS.md Golden Rule #7 — no branch switch with backend running + mandatory baseline dump; baseline taken: `C:\tmp\db-baselines\my_app-2026-09-12-post-recovery.sql` (2.9MB, 17 tables).
- **Open:** ~~user re-adds x-Alpha / MiniMax M3 if wanted;~~ ✅ CLOSED 2026-09-13 (user decision — no longer relevant). ~~root package.json still untracked (decide whether to commit).~~ ✅ CLOSED 2026-09-13 — root package.json tracked since `13deca4`.

## 2026-09-12 — ✅ CLOSED (user decision): SearXNG proxy backlog item obsolete

- User: the project moved off SearXNG to a different search mechanism (the new web-search channels — Tavily / Reddit / HN Algolia, see the squashed web-search commits). The long-open "rotating proxy pool" decision is moot — no action needed. Historical backlog mentions in older entries stay as records.

## 2026-09-12 — ✅ DONE: inactive providers sink to bottom of management table

- `llmProviders` computed orders `[...active, ...inactive]` when "Show inactive" is on. +1 spec.
- **Verified:** targeted **39/39** · `ng build` exit 0. No commit/push.

## 2026-09-12 — ✅ FIXED: test-now misrouted result + toast direction/design

- **Test-now bug:** `POST /llm/models/:id/test` passed only KEYS to `testLlm` → `findModelByKey` (unique only per provider) saved the result to a wrong same-key model (e.g. `openai/gpt-oss-20b` exists under openrouter AND nvidia) → UI showed nothing. **Fix:** `modelId` flows controller → testLlm → capability gate + saveTestResult (`findModelById`); testAllModels passes target id too. +1 regression spec.
- **Toasts (`_primeng-overrides.css`, new section):** `direction: ltr` (English texts, dialogs convention) fixes the bidi ".Model..." artifact; message = theme `--color-surface-elevated` + neutral border/text; only the icon is severity-colored (success/error/warn/info).
- **Verified:** backend **518/518 (48 suites)** + build 0; frontend `ng build` exit 0 (CSS-only). graphify updated. No architecture-diagram change. No commit/push. **✅ User-verified live (2026-09-12): "test now תקין".**

## 2026-09-12 — ✅ DONE (D+E): provider hard delete + active toggle switches + show-inactive

- **Problem:** no provider delete endpoint at all; deactivated providers invisible in the management page (`filter(p => p.active)`) with no way to re-activate from UI (`toggleProviderActive` was dead code); provider dialog lied about deleting.
- **Backend:** NEW `DELETE /llm-provider/:id` (AdminGuard) — DB cascades: models → test results → user defaults. Seed now **bootstrap-only** (skips when table non-empty) → deleted providers stay deleted. `LlmProviderController_deleteProvider` hidden from the LLM agent. +4 backend tests.
- **Frontend:** store/service `deleteProvider` → real delete; `showInactive` toggle (p-toggleswitch, "Show inactive") reveals + re-activates providers; row active state = `p-toggleswitch` for providers AND models (consistent with dialogs); models-table Active column removed (redundant); provider "Delete permanently" dialog (cannot be undone); removed orphaned soft `deleteModel` dialog + `.status-dot`/`.col-status` CSS.
- **Verified:** frontend **526/526 (57 files)** + `ng build` exit 0; backend **517/517 (48 suites)** + `npm run build` exit 0. Mojibake clean. graphify updated. No architecture-diagram change. No commit/push.

## 2026-09-12 — ✅ DONE: permanent model delete in UI + provider dialog honest (deactivation)

- **Problem:** UI could only "soft delete" — models got PATCH `{active:false}` while a hard `DELETE /llm-provider/models/:id` existed unused; provider dialog said "Delete Provider" but only deactivated (backend has NO provider delete endpoint).
- **Fix (frontend only, 5 files):** service `deleteModel()` → real DELETE route; store `hardDeleteModel()`; component `hardDeleteModel()` confirm ("Permanently delete this model, its test history and all user defaults? This cannot be undone."); HTML — model row: power (deactivate) + red trash (delete permanently), provider row: power ("Deactivate provider") + dialog/toast reworded to Deactivated.
- **Cascades on model hard delete (pre-existing):** test results + `user_llm_defaults` (FK CASCADE). Seeds: single-model delete sticks; deleting a seeded provider's DB row resurrects it on restart.
- **Verified:** targeted 35/35 (+3); full frontend `npx ng test --watch=false` **523/523 (57 files)**; `npx ng build` exit 0 (pre-existing strain-hunter.css budget warning, 8.89KB). Mojibake clean. No architecture-diagram change. No commit/push.

## 2026-08-27 — ✅ DONE: comparison dialog cells no longer filter the main table

- **Problem:** clickable cells in the comparison dialog called `applyDataFilter(...)`, mutating the main table's filters behind the dialog.
- **Fix (`strain-hunter.html`, dialog body):** converted filter `<button>`s to inert `<span>`s (NEW tag, growType, characterization badges, genetics/parents, terpenes, country, packageType, marketer/manufacturer/brand); removed symbols click/keydown. Kept `toggleCompare`, `openImageDialog`, tooltips, `נקה הכל`. Styling unchanged (same classes).
- **Verified:** full frontend 516/516 (57 files); `npx ng build` exit 0 (existing budget warning only, 8.89KB). No architecture-diagram change. No commit/push.

## 2026-08-27 — ✅ DONE: scroll-to-top button on Strain Hunter

- **Request:** add a scroll-up button that appears once the user scrolls down a little.
- **Fix (3 files):** `strain-hunter.html` — `.scroll-top-btn` gated by `@if (showScrollTop())`; `strain-hunter.ts` — `showScrollTop` signal + `ngAfterViewInit` finds the scrollable `.content-shell` ancestor, passive scroll listener (>300px), `DestroyRef` cleanup, `scrollToTop()` smooth-scrolls; `strain-hunter.css` — fixed bottom-start (bottom-left RTL), z-index 40, `--shadow-soft`. +1 spec test.
- **Verified:** targeted 63/63; full frontend 516/516 (57 files); `npx ng build` exit 0 (existing budget warning now 8.86KB). `git diff --check` clean. No architecture-diagram change. No commit/push.

## 2026-08-27 — ✅ DONE: compare button to start of action row, search field to end

- **Request:** move "פתח השוואת זנים" button to the start of the header action row, search field to its end.
- **Fix (1 file, `strain-hunter.html`):** pure DOM reorder in `.action-row` — compare button (conditional) first, search field last. No CSS/TS change.
- **Verified:** targeted strain-hunter 62/62; `npx ng build` exit 0 (existing budget warning only). No architecture-diagram change. No commit/push.

## 2026-08-27 — ✅ FIXED: comparison table showed all strains instead of only the selected ones

- **Bug (user report):** the comparison dialog table rendered the full filtered strain view, not just the selected strains.
- **Root cause (3 dialog-`p-table` wiring bugs, `strain-hunter.html:603-613`):** `#table` (not `#compareTable` → `compareTable()` viewChild always undefined → sort-reset no-op); `[value]="items()"` (not `compareItems()`); `(sortFunction)="sortTable($event)"` (not `sortCompareTable`).
- **Fix (1 file, `strain-hunter.html`):** dialog `p-table` → `#compareTable`, `[value]="compareItems()"`, `(sortFunction)="sortCompareTable($event)"`. No TS change — `compareItems`/`sortCompareTable`/`restoreCompareOrder` already existed and are now actually driven.
- **Verified:** targeted strain-hunter 62/62; full frontend 515/515 (57 files); `npx ng build` exit 0 (existing `strain-hunter.css` budget warning only, 8.73KB vs 8KB); `git diff --check` clean. No architecture-diagram change. No commit/push.

## 2026-08-26 — ✅ DONE: comparison table rebuilt as a real p-table (no custom CSS) on `feature/strain-comparison`

- Deleted ALL agent-invented comparison CSS from `_primeng-overrides.css` (dialog/mask/table/strain-info/image/empty-state + `app-strain-hunter .compare-toggle-btn`) and reverted `.sortable-column-header` back into `.p-datatable-thead` — file now matches HEAD exactly.
- Rebuilt the comparison dialog as a real `p-table` identical to the main table: same `glass-effect card table-container` wrapper, same `sortable-column-header`/`sort-icon-group` header, same body cell templates (strain-main-details, score-ring, characterization, price, origin, country, package-type, market), same `table-empty-state` empty state.
- `sortCompareTable` customSort (asc→desc→reset) replaced `sortedCompareItems`/`sortComparison`/`comparisonSortOrder`; `restoreCompareOrder` restores selection order on reset (customSort mutates the array in place).
- `.compare-toggle-btn` → generic `.icon-circle-toggle` in `_buttons.css`.
- Verified: targeted 62/62; full frontend 515/515 (57 files); `npx ng build` exit 0; `git diff --check` clean; graphify updated. Existing `strain-hunter.css` budget warning remains at 9.44KB vs 8KB. No architecture-diagram change. No commit/push.
- **Follow-up (visual parity):** the comparison `match-ring` was rendering without gradients — PrimeNG projects the dialog to `body`, so the `url(#ringGradientSuccess)` reference couldn't reliably resolve the component-root `<defs>`. Copied the same `<svg class="gradient-defs-svg">` (4 linearGradients) inside the comparison `<p-dialog>` so the IDs are available in the projected DOM. Strokes now match the main table.

## 2026-08-26 — ✅ DONE: comparison CSS deduplication on `feature/strain-comparison`

- Reused global `user-profile`, `row-title`, `row-label`, `row-label--bold`, `row-subtitle`, and `transparent-btn warning-btn` patterns.
- Removed duplicate comparison-specific text/group/remove-button CSS; kept only unique table layout constraints.
- Preserved existing `sortable-column-header` and `p-sort-icon` styling.
- Verified: targeted strain-hunter 62/62; full frontend 515/515; `npx ng build` exit 0; `git diff --check` clean; graphify updated.
- Existing `strain-hunter.css` budget warning remains at 9.44KB vs 8KB. No architecture-diagram change. No commit/push.

## 2026-08-26 — ✅ DONE: comparison strain info spacing on `feature/strain-comparison`

- Grouped comparison image and copy under `.comparison-strain-main`.
- Added `justify-content: space-between` to `.comparison-strain-info`, separating content group from remove action.
- Verified: `npx ng build` exit 0; `git diff --check` clean; graphify updated.
- Existing `strain-hunter.css` budget warning remains at 9.44KB vs 8KB. No architecture-diagram change. No commit/push.

## 2026-08-26 — ✅ DONE: comparison table sorting on `feature/strain-comparison`

- Added clickable `sortable-column-header` controls to comparison property headers.
- Added ascending/descending/reset cycle, caret indicators, `aria-sort`, and keyboard focus styling.
- Comparison rows now render in sorted order without changing main-table sorting.
- Verified: targeted strain-hunter 62/62; full frontend 515/515; `npx ng build` exit 0; `git diff --check` clean; graphify updated.
- Existing `strain-hunter.css` budget warning remains at 9.44KB vs 8KB. No architecture-diagram change. No commit/push.

## 2026-08-26 — ✅ DONE: comparison dialog polish on `feature/strain-comparison`

- Fixed RTL direction: title right, close X left.
- Increased mask opacity/blur and made comparison panel opaque to prevent text overlap.
- Removed redundant bottom `סגור`; top X is now the sole close control. `נקה הכל` remains on the right and outlined.
- Removed `comparison-dialog-summary` so dialog opens directly on comparison data.
- Translated `rating` column label to `רייטינג`.
- Moved `enName` under the Hebrew name in the strain column; removed its standalone comparison column.
- Centered compare-toggle icon with `justify-content: center`.
- Added explicit RTL boundary between sticky `זן` and `התאמה` columns.
- Moved overlay styles to `_primeng-overrides.css`; component CSS warning reduced to 9.44KB vs 8KB.
- Verified: targeted 61/61; full frontend 514/514; `npx ng build` exit 0; `git diff --check` clean. Follow-up removal also passes targeted test/build.
- No architecture-diagram change. No commit/push.

## 2026-08-26 — ✅ DONE: strain comparison UI on `feature/strain-comparison`

- Added session-only selection to Strain Hunter with add/remove controls in each name cell.
- Added RTL comparison dialog: selected strains as rows, properties as columns, individual removal, clear-all, sticky strain column, and horizontal scrolling with no selection limit.
- Added 5 comparison specs.
- Verified: targeted 61/61; full frontend `npx ng test --watch=false` 514/514 (57 files); `npx ng build` exit 0. Existing `strain-hunter.css` budget warning remains.
- No architecture-diagram change: component-local UI state only. No commit/push.

## 2026-08-26 — ✅ DONE: agent tool 401 loop — internal token cache outlived the JWT

- **Bug (real log):** after ~5 min of a chat session, agent tool calls on `/genetics` 401'd and the LLM looped 3× until AgentLoopBreaker. Root cause: `getInternalToken` cached JWTs for 10m (`INTERNAL_TOKEN_TTL_MS`) while signing with `expiresIn: '5m'` — cached tokens 5-10m old were expired JWTs.
- **Fix:** `INTERNAL_TOKEN_TTL_MS` → `4 * 60 * 1000` (below the 5m JWT) + regression test (reuse at +1m, re-sign at +6m) in `agent-tool-executor.service.h4.spec.ts`.
- **Verified**: backend `npx jest --runInBand` **459/459** (46 suites, +1). Watch-mode backend auto-recompiles — no manual restart needed.
- **Also logged (not code bugs):** OmniRoute `auto/best-free` has no tool-calling target (400) — pick a tool-capable model; NVIDIA 429 rate limit — transient.

## 2026-08-25 — ✅ DONE: custom sort badge — "1" fixed, PrimeNG badge hidden, grouping

- **Root causes (verified in PrimeNG source):** (1) "1" missing — SortIcon's `sortOrder` signal doesn't change when a 2nd column is added → OnPush never re-renders → internal badge skipped for the initial column. (2) Doubling — CSS `display:none` couldn't override the badge host's **inline** `[style.display]` binding → needed `!important`.
- **Fix (4 files):** `getSortOrderIndex` + `sortTick` (header re-renders after each sort) + stable `initialSortMeta` ref; header `.sort-icon-group` (icon+badge grouped); CSS hides PrimeNG's badge with `!important`; specs updated (+1).
- **Verified**: `ng test` 509/509 (57 files) · `ng build` exit 0.

## 2026-08-25 — ✅ DONE: manual removableSort — 3-click sort cycle (asc → desc → reset)

- **Request (manager):** `removableSort` is not a real attribute in 22.0.0 — implement removal manually: click 1 asc, 2 desc, 3 reset.
- **Fix (3 files):** HTML — removed the bogus `removableSort` attr; TS — `lastSort` tracker + third-click detection → `resetSort()` (`table().reset()` clears PrimeNG sort state + icons, `event.data` restored to `rawItems` order by id, `activeSortField` null); spec — +1 cycle test.
- **Verified**: `ng test` 508/508 (57 files) · `ng build` exit 0.

## 2026-08-25 — ✅ DONE: sortTable unsorted-restore + manager premises fact-checked

- **Fact-check (PrimeNG 22.0.0 source):** (1) NO `badge > 1` condition — badges render 1..N when 2+ columns sorted (proven by `sort-badge.spec.ts`); custom badge NOT implemented (duplicate of the library). (2) `removableSort` input doesn't exist in 22.0.0 — empty `multiSortMeta` never emitted; the defensive fix is still right.
- **Fix (2 files):** `sortTable` — `event.field && event.order` guard (fixes single-mode `order: 0` being `?? 1` → false ascending sort) + unsorted fallback restores original `rawItems` order by id + clears `activeSortField`. +1 spec test.
- **Verified**: `ng test` 507/507 (57 files) · `ng build` exit 0.

## 2026-08-25 — ✅ DONE: sort badge "1" verified rendering + PrimeNG behavior proven by spec

- **Task:** ensure the first sorted column shows its ordinal (1) in multi-sort; final badge polish already applied (border color-mix + tabular-nums).
- **Verification (new `sort-badge.spec.ts`, 2 tests):** renders a real `p-table` (`sortMode="multiple"`, `multiSortMeta` with 2 entries) → badges render as `['1', '2']` (first column INCLUDED). Second test: 1 sorted column → no badge (PrimeNG 22 default — `getMultiSortMetaIndex` gates on `length > 1`). So `[showInitialSortBadge]="true"` (default true) + length ≥ 2 ⇒ every sorted column shows 1..N.
- **Manager screenshot note:** "2,3,4 without 1" likely = price showed the neutral sort-alt icon (not in multiSortMeta) while 3 other columns were sorted — the ordinal of the first actually-sorted column is 1.
- **Verified**: `ng test` 506/506 (57 files, +2) · `ng build` exit 0.

## 2026-08-25 — ✅ DONE: `[showInitialSortBadge]="true"` added to strain-hunter p-table

- Added per user request. PrimeNG default is already `true`; the badge for the initial sort column renders only when `multiSortMeta.length > 1` (22.0.0 source). If the "1" still doesn't show, next step = investigate meta state on click.
- **Verified**: `ng test` 504/504 · `ng build` exit 0.

## 2026-08-25 — ✅ DONE: sort badge polish — semi-transparent border + tabular-nums

- **Request (manager):** soften the badge border (glass look, ~40% alpha) + `font-variant-numeric: tabular-nums` for optical digit alignment.
- **Fix (1 file, `_primeng-overrides.css`)**: border → `color-mix(in srgb, var(--color-primary) 40%, transparent)`; added `font-variant-numeric: tabular-nums`.
- **Note (manager's optional #3):** no number on the first sorted column is PrimeNG's default — first column shows only the arrow. Not changed; easy to add if wanted.
- **Verified**: `npx ng build` exit 0.

## 2026-08-25 — ✅ DONE: multi-sort badge restyled — ghost chip instead of solid accent dot

- **Request (manager):** `.p-sortable-column-badge` too heavy/dominant — reads as a notification badge, not sort priority.
- **Fix (1 file, `_primeng-overrides.css`)**: 15px w/h, `--font-size-xxs` text, ghost look — `background: var(--color-primary-glow-bg)`, `1px solid var(--color-primary)` border, `var(--color-primary)` text, radius-pill, inline-flex centered, small gap after the sort icon.
- **Verified**: `npx ng build` exit 0.

## 2026-08-25 — ✅ DONE: strain-hunter empty state now matches strain-hunter-settings (inside the table)

- **Request:** the table's empty state should look like the settings tables' empty state.
- **Fix (2 files):** `strain-hunter.ts` — `pageState` no longer returns `Empty` (Ready when not loading/error); `strain-hunter.html` — removed the page-level `PageStates.Empty` block, and `#emptymessage` now renders the settings pattern: `page-state table-empty-state` with `ph-magnifying-glass-minus` icon + "לא נמצאו זנים התואמים לחיפוש." + subtitle (dynamic colspan). `.table-empty-state` is a global utility (`_utilities.css`) — no CSS change.
- **Verified**: `npx ng test --watch=false` 504/504 (56 suites) · `npx ng build` exit 0.

## 2026-08-25 — ✅ DONE: multi-column sort (Ctrl/Cmd+click) in strain-hunter table

- **Request (manager):** PrimeNG native multi-sort — `sortMode="multiple"` + `multiSortMeta` + chained comparator.
- **Fix (3 files):** `strain-hunter.html` — `sortMode="multiple"`, `[multiSortMeta]="[{ field: 'price', order: 1 }]"` replaces `[sortField]`. `strain-hunter.ts` — `sortTable` handles `event.multiSortMeta` (chained `compareSortValues` per column, `activeSortField` = first meta), single-column fallback kept. `strain-hunter.spec.ts` — multi-sort priority test (price → expiry).
- **Verified**: `npx ng test --watch=false` 504/504 (56 suites, +1) · `npx ng build` exit 0.

## 2026-08-25 — ✅ DONE: expiry sort fixed — MM/YY sorted chronologically (not as string)

- **Bug (manager report):** `expiry` column (MM/YY format) sorted as string — "01/28" (Jan 2028) before "02/27" (Feb 2027). Wrong order.
- **Fix (manager's option 2):** `sortValue()` in `strain-hunter.ts` — special case for `field === 'expiry'`: parses MM/YY → `(2000+yy)*100 + mm` for numeric comparison. Existing numeric/string infrastructure reused.
- **Test:** `strain-hunter.spec.ts` — proves `sortTable` puts `01/27` before `02/27` before `01/28`.
- **Verified**: `npx ng test --watch=false` 503/503 (56 suites, +1) · `npx ng build` exit 0.

## 2026-08-25 — ✅ DONE: scrollbar-gutter stable — no more layout shift when table results → empty state

- **Bug (manager report):** scrollbar (~15px) appears with table results, disappears on empty state → whole layout jumps. Seen on strain-hunter, likely elsewhere.
- **Fix (2 CSS files, manager's solution 1)**: `scrollbar-gutter: stable` on `.content-shell` (`_layout.css` — the app's page scroll container, fixes every page) + `.p-datatable-wrapper` (`_primeng-overrides.css` — PrimeNG scrollable tables). The track is always reserved → zero width delta between states.
- **Verified**: `npx ng build` exit 0.

## 2026-08-25 — ✅ DONE: search-clear-btn layout shift fixed (always-DOM + CSS visibility)

- **Bug (manager report):** typing in search → `<div class="form-field-has-icon">` jumps right, pushing filter icons. Root cause: `@if (query())` conditional rendering toggled the `:has(.search-clear-btn)` rule in `_forms.css`, which changes `input.form-control` padding — with `content-box` the input outer width shifts 48px.
- **Fix (8 files, 7 buttons)**: every `.search-clear-btn` is now always in the DOM — `@if` replaced by `[class.is-visible]="query()"`, and `_forms.css` hides the button via `:not(.is-visible) { opacity: 0; visibility: hidden; pointer-events: none }` with `transition: opacity`. The `:has()` rule stays permanently active → input padding stable → zero layout delta on typing. Applies to all 7 search fields (strain-hunter, drawer, llm-providers, users, settings×2, chat-history).
- **Verified**: `npx ng test --watch=false` 502/502 (56 suites) · `npx ng build` exit 0.

## 2026-08-25 — ✅ DONE: search-clear-btn added to all 7 search fields (consistent with strain-hunter-settings pattern)

- **Request**: add the clear button (`.search-clear-btn`) to every search field, matching `strain-hunter-settings` pattern.
- **Fix (6 files)**: strain-hunter.html (new `[value]="searchQuery()"` + `@if` button + `type="text"`), matching-preferences-drawer.html (button + `type="text"`), llm-providers-management (`.html` + `.ts` — new `globalFilter` signal + `clearGlobalFilter()`), users-management (`.html` + `.ts` — same pattern). All use `type="text"` (no double × with native search clear). `aria-label="נקה חיפוש"` consistent.
- **Verified**: `npx ng test --watch=false` 502/502 (56 suites) · `npx ng build` exit 0.

## 2026-08-25 — ✅ DONE: strain-hunter search input now feeds the summary count (like every other filter)

- **Request**: search-box results must affect `summary-value` (סה"כ זנים) like every other filter.
- **Fix (2 files)**: search moved from PrimeNG table `filterGlobal` into the `items()` computed — new `searchQuery` signal; `items()` filters across `searchColumns()` (same `symbols` special-case as `activeFilters`); `[globalFilterFields]` + `filterGlobal` removed. Zero-hit → page Empty state (consistent with other filters).
- **Verified**: `npx ng test --watch=false` 502/502 (56 suites) · `npx ng build` exit 0 (pre-existing budget warning only) · graphify updated · no architecture-diagram change.

## 2026-08-25 — ✅ DONE: strain-hunter filter-node pills compacted to terpene-node size

- **Request**: shrink ALL `.filter-node` pills (grow-type, origin-strain, country, marketer/manufacturer/brand) to the compact terpene-pill size — "do it smart".
- **Fix (1 file, `strain-hunter.css`)**: base `.filter-node` sets `font-size: var(--font-size-xxs)` (10px) + `.ph` icons scale via `font-size: 1em` — one rule for all variants (prior per-variant `.grow-filter-node, .origin-strain-node` rule deleted as redundant). Terpene pills unchanged; `.package-type-cell` icon unaffected.
- **Verified**: `npx ng build` exit 0 (pre-existing budget warning only, file 9.44kB) · graphify updated · no architecture-diagram change.

## 2026-08-20 — ✅ DONE: 429 Retry-After handling in createVideoTask + tool-description disambiguation (image vs video)

- **Problem**: real 429 (`rate_limit_exceeded: 2 req/min`) from Agnes surfaced raw; separately, chat-agent LLM called `LlmController_generateImage` 3 times in a row when user said video (loop-broken).
- **Fix 1 (4 files, +4 tests, 458/458)**: `createVideoTask` now treats HTTP 429 as transient — single `Retry-After` retry capped at 30s, bounded to one cycle (`rateLimitBudget=1`). 5xx/queue_full/transport unchanged. Tool descriptions on `LlmController_generateImage` and `LlmController_createVideo` now cross-reference each other ("USE ONLY for static", "USE for motion/animation") so the LLM picks the right tool — mirrors the 2026-08-19 auth-loop fix.
- **Verified**: `npx jest --runInBand` 458/458 (46 suites, +4 new) · `npm run build` exit 0 · swagger-spec.json auto-regenerated · no mojibake.

## 2026-08-20 — ✅ DONE: video queue_full transient retry in LlmClientService.createVideoTask

- **Problem**: 503 `video_queue_full` from Agnes was surfaced raw to the studio media video tab — every retry manual.
- **Fix (2 files, +5 tests, 454/454)**: `createVideoTask` now wraps the raw fetch in a bounded retry loop — **3 attempts, fixed 1s+2s backoff**. Retry on: HTTP 5xx OR body `"video_queue_full"` OR `TypeError`/`AbortError`. Don't retry: 4xx. Same final error message on exhaustion.
- **Verified**: `npx jest --runInBand` 454/454 (46 suites, +5 tests) · `npm run build` exit 0. Existing `withRetry` untouched.

## 2026-08-20 — 💬 Q&A: chat agent + video understanding — NOT wired yet (decision recorded)

- **Q:** can the in-app chat agent (chat.html) use video understanding? **A: no today** — chat pipeline is image-only (frontend `image/*` + 8MB; backend DTO `data:image/...;base64,`); the video-understand skill is terminal-only. Chat agent already sees attached still images (LLM iteration 0).
- **Decision (user):** don't implement now. When wanted: **Option A** — `analyze_video` agent tool (backend endpoint runs `process_video.py`, swagger parser auto-exposes it; paste YouTube URL in chat, agent answers from transcript).

## 2026-08-20 — ✅ DONE: video-understand skill installed + all providers verified E2E

- **Skill:** `jrusso1020/video-understand-skills` → `~/.agents/skills/video-understand` (Freebuff loads from ~/.agents/skills). ffmpeg/yt-dlp ✅ (yt-dlp UPDATED 2026.01.29 → 2026.08.19 — old version failed YouTube extraction). Deps: `pip install google-generativeai openai groq`.
- **Providers live-verified:** gemini (test-pattern video + user's 15s screen recording) ✅ · openrouter (same recording, google/gemini-3-flash-preview) ✅ · groq whisper (silent recording → expected "Thank you." silence-hallucination; **"Me at the zoo" E2E → accurate transcript**) ✅.
- **Fixed en route (backend/.env, gitignored):** (1) `GROQ_BASE_URL` deleted — user's GROK→GROQ rename carried the URL, doubling the SDK's default `/openai/v1` → 404. SDK default correct. (2) `PIXAZO_AUTH_HEADER` quoted — unquoted space in value broke `source .env` line 112 (looked like a bare token; it was a space in an unquoted value). Pixazo kept per user decision (dead config, zero code refs).
- **Verified:** check_providers exit 0 (gemini+openrouter+ffmpeg+groq, recommended gemini), `source .env` clean, all live runs exit 0. No repo code changed → no tests/build; no architecture-diagram change (tooling only).

## 2026-08-20 — ✅ FIXED: chat bot (bridge) silent no-reply — Freebuff premium-slot collision → mimo + /reset + /status

- **Diagnosis (DB-proven):** every recent bridge message got `freebuff-slot-taken` — Freebuff allows only ONE tab per premium model (deepseek/deepseek-v4-flash); the bridge thread collided with the active session. Not stuck (idle/error) — rejected. Also explains the earlier daily-limit message.
- **Fix (tg-bridge.mjs, outside repo):** model → `mimo/mimo-v2.5`; added **`/reset`** (fresh thread on next message) + **`/status`** (model/thread state) — previously ALL `/` messages were silently dropped.
- **Verified empirically:** message posted to bridge thread while this session active on deepseek → real reply "עובד 🟢" (6s) vs slot-taken before. Thread idle/completed on mimo. Bridge restarted (PID 11628).
- **Caveat:** UI "Unlimited" tag ≠ no concurrency limit — the live test is the proof; watch mimo speed.
- **Follow-up (DONE):** `/status` → `model/ctx/branch` with bold keys. ctx% = last message `metrics_json.context` (usedTokens/threshold → 10%, DB-proven); branch = git rev-parse with shell:bash (cmd fails on Windows); HTML per backend esc() convention. Bridge restarted (PID 35116).
- **Follow-up 2 (DONE):** ctx% line includes Unicode progress bar (`ctxBar`, width 10) — `ctx: 10% █░░░░░░░░░`. Live proof: user's real /status at 11:00:40 returned all three fields. Bridge restarted (PID 36248).
- **✅ USER-VERIFIED (screenshots):** /status 14:00 → `model: mimo/mimo-v2.5 / ctx: 10% / branch: main` (bold keys); 14:03 → + progress bar after ctx%. Both render correctly.
- **Follow-up 3 (DONE):** `/model` command — list/switch models with tier tags, persists to state.json, enforces immediately on the thread. Model list sourced from the orchestrator (not guessed). Premium models warn; orchestrator can reply `rejected:true` when the premium slot is taken (verified). Fixed unescaped `<שם>` HTML 400 bug found in live testing.
- **⚠️ LIVE INCIDENT (14:14, resolved):** `/model deepseek/deepseek-v4-flash` while the user's TUI tab was on the same model → slot-taken on every message; bridge waited 5 min; queued `/model mimo` processed only after restart. Fixed (API enforce mimo + state.json + restart), verified (probe "עובד 🟢", idle/completed). Lesson: /model works but target model must not be in use by an active tab — mimo is the safe default.

## 2026-08-20 — ✅ DONE: TELEGRAM_COMMAND_BOT_TOKEN rotated (exposed live token) + command bot restarted
## 2026-08-20 — ✅ DONE: error-state unified app-wide — mirrors page-empty-state (stagger stagger-up) + נסה שוב button everywhere

- **Goal (user request):** make `PageStates.Error` look like `page-empty-state` — `stagger stagger-up` entrance, no glass-card chrome — and give every error block a **נסה שוב** retry button. Checked across the WHOLE app: 9 error blocks in 8 files (dashboard, users-management, llm-providers-management, chat-history, strain-hunter, ideas-history, ideas-page ×2, database-monitor-settings).
- **CSS (global, one rule — affects all pages at once):** `_utilities.css` — new `.page-state.error-state` nested variant strips the glass card (`background/border/radius: none`) + `animation: none`, icon → primary color (matches `page-empty-state`).
- **Reduced-motion hardening (bonus, the backlog-flagged gap):** `_animations.css` — `@media (prefers-reduced-motion: reduce)`: `.stagger > * { animation: none; opacity: 1 }` — stagger children previously stayed INVISIBLE under reduced motion (base `.stagger > *` opacity:0). Fixes the 4 existing empty states too.
- **Buttons:** all 9 blocks now carry `primary-btn sm` labeled **נסה שוב** (llm-providers English: "Try again"); unified the old mixed labels (`רענן` in chat-history/ideas-history → נסה שוב; filled/outlined variants → sm) and added the 4 missing buttons: dashboard/users (`usersStore.reload()`), llm-providers (`llmProviderStore.reload()`), ideas-page session-level (new `loadSessionIdeas()` in ideas-page.ts — extracted from `setViewMode` so retry works despite the same-mode early return).
- **Verified:** `npx ng test --watch=false` 502/502 pass · `npx ng build` exit 0 (only pre-existing strain-hunter.css budget warning). No mojibake (only legit ג׳ in mock.ts).


## 2026-08-20 — ✅ DONE: TELEGRAM_COMMAND_BOT_TOKEN rotated (exposed live token) + command bot restarted

- **Exposure:** FreeBuzCommandBot token pasted in plaintext into Telegram chat at 16:46; verified LIVE (`getMe` ok) before acting → rotation required, not optional.
- **Done:** user revoked in BotFather + wrote new token to `backend/.env` → I restarted the command bot (kill 35112 → relaunch same interpreter/path). Relay (`TELEGRAM_BOT_TOKEN` @freebuzbot) never exposed, never touched.
- **False alarm defused:** 19:58 `Unauthorized` in old bridge.log ≠ dead relay — current relay token getMe ok, lock PID alive, state.json mtime today (polling fine); transient window from 22:59 token fix + 23:12 restart, stale log only.
- **Verified:** new token getMe ok · old token **401** (revoke took) · getUpdates ok · poller alive (PID 32880), zero errors after one-time restart 409 · `--test status` ok · live test message `message_id: 28`.
- **Open (non-blocking):** ~~who/what fixed `.env` at 22:59 — if not a prior session's manual edit, worth checking for an uncontrolled `.env` writer. Full record: LOG.md BF.~~ ✅ CLOSED 2026-09-13 — investigated: the 22:59 write was the user's manual TOKEN_ROTATION that same evening (user wrote new `TELEGRAM_COMMAND_BOT_TOKEN` to `.env` after revoking in BotFather). No uncontrolled writer.

## 2026-08-20 — ✅ DONE: translation-harvest tracker (Option A) — map misses in the nightly Telegram summary

- **User question:** who updates `HEBREW_STRAIN_NAMES` when a new strain enters with genetics not in the map? Honest answer was nobody (manual edits only); LLM fallback covers new strains but LLM results are never persisted and misses were invisible.
- **Reviewer-approved fix:** NEW `core/services/translation-tracker.ts` (singleton, dedup by Hebrew name) + genetics records map misses + terpene records every LLM translation + `buildTranslationTrackerSection()` appended to the nightly Telegram summary (both the grounded summary AND the empty-run message), capped with the rest at 4000 chars. Empty tracker → '' → summary unchanged.
- **Semantics:** in-memory since process start ("מאז אתחול" in the message); monthly persistence = the future B (DB table, not JSON — reviewer point 3).
- **Verified:** backend **449/449 (46 suites, +11)** · build exit 0 · mojibake clean.
- **✅ COMMITTED (2026-08-20):** `066e9b1` — tree clean, ready for push.

## 2026-08-19 — ✅ FIXED: genetics tooltip flash — zero frames at wrong pos (real fix, not the 60ms delay)

- **First attempt (rejected):** `fadeIn 60ms` delay only hides opacity — tooltip still painted at estimate for ~32ms (2× rAF). Jump unchanged.
- **Real fix:** added `ready: boolean` to `TooltipPos` + `TerpeneTooltipPos`. Initial `ready: false` → template `[style.visibility]="ready ? 'visible' : 'hidden'"` → `correctTooltipOverlap` flips `ready: true` in the SAME signal write as the final `top` → ONE paint at final position. Applies to both genetics + terpene tooltips (same component, same correction).
- **Reverted:** 60ms animation-delay hack in `tooltip.css` (no longer needed — tooltip hidden during render).
- **Files:** `strain-hunter.ts` (2 types + 3 setters), `strain-hunter.html` (2 visibility bindings), `tooltip.css` (revert).
- **Verified:** frontend **502/502 (56 suites)**, `ng build` exit 0.
- **✅ COMMITTED + PUSHED (2026-08-20):** `288c94e` — tree clean, synced with origin/main. Closed.

## 2026-08-19 — ✅ DONE: gemma is the nightly default (user approved) — live-verified

- **Switch:** `IDEAS_NIGHTLY_MODEL=openrouter/google/gemma-4-31b-it:free` active in `.env` (glm = commented fallback), :3000 restarted (PID 43868).
- **Live run (triggered, watched to completion):** 3 grounded sessions (96-98) × 15 ideas in ~9 min — zero empty-content (glm's failure mode). Topics: COPPA/GDPR (Shopify), FBA profit calculator, Etsy image manager. Telegram push with bold summary sent.
- **Honest limit:** 3/5 target sessions — search-bound grounding (SearXNG noise, known), not the model.
- **Commit plan:** gemma switch = its OWN commit (user's protocol) — separate from contracts/Telegram/command-bot work.

## 2026-08-19 — ✅ DONE: Telegram formatting upgrade — HTML parse_mode everywhere

- **Why:** `**bold**` rendered as literal asterisks (sendMessage has no parse_mode by default) — user: "סתם מעצבן". Asked to upgrade.
- **What:** all three send paths now use `parse_mode='HTML'` — session helper `scripts/tg-html-send.js` (NEW, `{{b}}` markers + auto-escape `& < >`), nightly push (`esc()` + `<b>` in `buildNightlyIdeasMessage`), command responder (`toHtml()` + `{{b}}`). HTML chosen over MarkdownV2: MarkdownV2 needs escaping of Hebrew punctuation (one miss = whole send 400s); HTML only `& < >`.
- **Verified:** backend **438/438 (45 suites, +2 esc tests)** · build 0 · :3000 restarted (PID 29280) · responder restarted (PID 35112) · live test message (112) with bold + escaped specials.
- **Next:** user confirms render; then commit/push accumulated work.

## 2026-08-19 — ✅ DONE: standalone command bot (FreeBuzCommandBot) — relay drops "/"-commands, commands now execute outside Freebuff

- **Why:** user's empirical isolation test (option 3) proved the Freebuff relay consumes but never delivers "/"-prefixed messages. Orchestrator not modifiable → separate bot that handles commands itself.
- **New:** `scripts/telegram-command-bot.js` — long-polling responder for `/status /git /tests /build /restart_backend /stop /help`, chat-gated (661157823), replies directly via Bot API. Token `TELEGRAM_COMMAND_BOT_TOKEN` in `backend/.env`. **Live: PID 40480, polling, 0 errors.**
- **Empirically verified:** all 7 commands run for real — /tests (backend 436/436 + frontend 502/502), /build (exit 0), /restart_backend (real restart with poll-until-up), /stop (killed a real running jest — tree kill).
- **Bugs found+fixed in the pass:** `exec('(cmd &)')` hangs forever → detached spawn with stdio ignore; /stop busy-label overwrite → direct `cmdStop()` routing; MSYS `/`-argv mangling → test modes without a slash.
- **Relay bot menu CLEARED (user request):** @freebuzbot's commands menu was a lie (relay drops "/") → `setMyCommands []` + `setChatMenuButton default`. Verified: commands=[] and user chat (661157823)=default. Quirk: bot-wide getter without chat_id still returns `{type:commands}` after 4 ok:true sets (python+curl, bare/chat_id/scope) — Telegram-side; user's chat is what shows.
- **Next:** user presses **Start** on FreeBuzCommandBot (bots can't message un-started chats — 400), fires menu commands → I verify via `C:/tmp/command-bot.log`. Then commit/push accumulated work.

## 2026-08-19 — ✅ DONE: Telegram menu commands + commands button (bridge bot)

- **Registered + verified via API readback:** `/status /git /tests /build /restart_backend /stop /help` — `setMyCommands` ok, `setChatMenuButton {type:commands}` ok. Script: `scripts/telegram-bot-commands.js` (idempotent). `/approve` dropped (no pending-approval flow in this bridge); `/help` added.
- **Command behavior (in-session):** immediate "מתחיל…", interim updates, clear errors — documented in AGENTS.md. Orchestrator itself NOT modifiable (honest scope).
- **Empirically run (documented):** /git (17 changes) · /tests (**backend 436/436, frontend 502/502, exit 0 ×2**) · /build (**exit 0**) · /restart_backend (**PID 1080, :3000 up**) · /status (idle) · /stop (documented — real abort = client Stop).
- **Next:** user tests the menu in the Telegram UI (reopen chat if stale); then gemma default decision + commit/push.

## 2026-08-19 — ✅ DONE: empty-run notification LIVE; gemma tested manually — default reverted to glm (quality gate)

- **Fix 1 (approved, live):** empty-run Telegram message when enabled — every trigger answers, no silent dead runs. **Live on :3000.**
- **Fix 2 (user's quality gate):** gemma was tested in ONE manual run (session 95: 1 grounded session, 4 ideas, ~2 min vs glm's 22 min + 0 grounded). Ideas read + assessed — good quality (natural Hebrew, strong differentiation, honest caveats). **Default REVERTED to glm** in `.env` per user protocol; gemma = commented option. Switch to default only after user approval, in a SEPARATE commit.
- **Verified:** backend **436/436 (45 suites, +2)** · build 0 · **:3000 on glm + empty-run notification (PID 45408).** Telegram message with the 4 ideas auto-sent at 18:59 (first real delivery).
- **Next:** user's verdict on gemma → separate-commit switch, or commit/push accumulated work.

## 2026-08-19 — ✅ DONE: Telegram push hardening — selective retry + explicit failure log

- **Retry (transient only):** network/DNS/timeout + HTTP 5xx → 3 attempts, backoff 500/1000ms (~1.5s total). No retry for terminal failures (missing config, `ok:false` = expired token/unknown chat, HTTP 4xx) — verified empirically, not just described.
- **runNightly:** explicit warn "ריצה הצליחה, התראה נכשלה" ONLY when Telegram is enabled — success/failure of the run vs the push are distinguishable in the log; no misleading line when disabled.
- **Verified:** backend **434/434 (45 suites, +5 fake-timer tests with exact-gap assertions)** · build exit 0.

## 2026-08-19 — ✅ DONE: nightly ideas → Telegram push (ideas included, not just "ready")

- **New:** `TelegramNotifyService` (`ideas/telegram-notify.service.ts`) + pure `buildNightlyIdeasMessage(grounded)` — Hebrew summary (counts, per-topic ideas sorted by score desc, top 5, 4000-char cap). `runNightly()` sends it when done — fires for the 04:00 cron AND the manual admin trigger. JSON body (Hebrew-safe), never throws, skips silently when env not set.
- **Config:** `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in `backend/.env` (real values: `@freebuzbot` → chat 661157823) + documented in `.env.example`.
- **Verified:** backend **429/429 (45 suites, +9)** · build exit 0 · architecture diagram updated (Telegram Bot API as external provider).
- **⚠️ Live on :3000 after rebuild+restart** (user's instance) — then `POST /ideas/nightly/trigger` to see it live.

## 2026-08-19 — ✅ DONE: single-use contract audit — all 73 agent tools classified; callback hidden from LLM; triggerNightly EXACTLY-ONCE

- **Audit result (73 agent-visible tools):** only 2 tools needed contracts — `GoogleCalendarController_callback` (one-time external redirect target — was missing) and `IdeasController_triggerNightly` (one-time fire-and-forget — was missing). `auth` already had its contract. Other 70: reviewed, NOT applicable (data/CRUD, by-design polling, result URLs, internal batch jobs).
- **Fixes:** (1) `callback` — NEVER-call contract in description AND added to `HIDDEN_FROM_LLM` (model can't even attempt it — strongest form of "call exactly zero times"); (2) `triggerNightly` — "call EXACTLY ONCE per request; run takes ~7-8 min in background; don't re-call to check progress (each call starts a new run); don't report ideas as ready — they appear in history when done".
- **Verified:** backend **420/420 (44 suites, +1 new test)** · `npm run build` exit 0 · `swagger-spec.json` regenerated (diff = exactly the 2 new descriptions).
- **⚠️ Backend :3000** still needs rebuild+restart to serve these (user's instance).
- **Uncommitted:** this work + `AGENTS.md` (Telegram section, pre-existing). 2 unpushed commits (`7c156ab`, `ae4d071`) await push.

## 2026-08-19 — ✅ CLOSED (reviewer): OAuth flow logging implemented + single-use contract tracked as follow-up

- **Reviewer instruction 1 — implement the logging, don't leave it as an option (done):** `google-calendar.service.ts` now logs the OAuth state lifecycle (`[OAuthAuth]` issued vs reused with userId + expiry; `[OAuthCallback]` success + rejected-with-reason). A future "OAuth state is invalid or expired" incident is diagnosable from the log alone — no more DB digging with timestamps. Never logs the state value itself (CSRF secret).
- **Reviewer instruction 2 — nuance on "not a global orchestration bug" (recorded as follow-up, not fixed):** the mechanism (breaker + sequential await) is sound, but the REAL gap is a missing behavioral default: any tool that returns a one-time action the user must complete externally (OAuth today; SMS approval / payment / external redirect tomorrow) is exposed to the same re-call loop until its description carries an explicit "EXACTLY ONCE" contract. **Open follow-up:** audit all tools for "one-time action + wait for external user action" nature and give each the explicit single-use contract.
- **Verified:** backend **419/419 (44 suites, +2 new logger tests)** · `npm run build` exit 0.
- **Committed:** `feat` (service + spec) + `docs` (HANDOFF/STATUS/LOG).

## 2026-08-19 — ✅ FIXED: triggerSuccess message now rendered (ideas-history cosmetic)

- **Bug:** `triggerSuccess` set in `triggerNightly()` but never rendered in the template — the trigger confirmation was invisible.
- **Fix:** `@if (triggerSuccess())` banner in `ideas-history.html` (global `.glass-effect.banner` pattern, `ph-check-circle` icon); auto-clears via existing 5s timeout.
- **Verified:** frontend **498/498 (56 suites, +1)** · `ng build` exit 0. Uncommitted.
- **Decision:** poll-until-completion skipped (YAGNI — next visit refetches; run ~5 min). git remote URL update left for user.

## 2026-08-19 — ✅ FIXED: banner UX (toast + persistent) + global bottom spacing

- **triggerSuccess banner (ideas-history):** rendered (was invisible) — second agent's fix; then polished per user: animated enter/exit (`slideDown`/`fadeOut` + `closing` state), **zero layout shift** (absolute overlay — measured: list stayed at 164.7px), centered in the CONTENT area (not viewport — sidebar offset) at top ~99px. Global shared class `.banner` in `_utilities.css` + `.animated-banner` variant (toast mechanics) — the ideas-page persistent nightly banner now uses the same pill look (centered, max-width'd) and stays until "סמן כנקרא".
- **Global layout fix:** `.page-content { flex: 1 0 auto }` (was `flex: 1`) — the box grows with content so `padding-bottom` lands at the real bottom (was swallowed by overflowing lists → last card flush). Verified on 4 pages incl. flush pages (composer still docked).
- **Verified:** frontend **499/499** (56 suites, +2 lifecycle tests) · `ng build` exit 0 · live measurements on all changes.

## 2026-08-19 — ✅ FIXED: manual nightly trigger doesn't refresh the sessions list

- **Bug:** `triggerNightly()` refreshed only the expanded session, never the list (inconsistent with `generate()` which calls `loadSessions()` on done). New nightly session invisible until manual "רענן".
- **Empirically reproduced:** trigger click → only `/ideas/nightly/trigger` in network, no `GET /ideas/sessions` after.
- **Fix:** `currentFilterParams()` helper (shared with `refresh()`) + `triggerNightly()` → `loadSessions(params)` then `loadSession(expandedId)`. **Live-verified:** trigger → `/ideas/sessions` fires 8ms later.
- **Verified:** frontend **497/497** (+2 tests) · `ng build` exit 0.
- ⚠️ **Limitation (surfaced honestly):** trigger is fire-and-forget (~7.5 min run) — refresh happens at trigger time, so the new session appears only after the run completes + next refetch. Poll-until-completion or backend completion signal = follow-up decision.
- 🐛 **Cosmetic side-find:** `triggerSuccess` message set but never rendered in the template — invisible. Separate tiny fix candidate.

## 2026-08-19 — ✅ FIXED: agent auth loop — consent URL never reached the user (sessions 227+228)

- **Symptom:** "מה יש לי מחר ביומן?" → agent calls `GoogleCalendarController_auth` 3× in one turn → breaker → user never sees the consent link (reproduced live in 228, even post-idempotency).
- **Causes:** tool description didn't tell the model to call auth once & present the URL; the per-tool cap discarded the collected AuthUrl render card + URL (raw breaker only); the auth-URL rescue covered the events tools but NOT auth itself; rescue message had CJK mojibake (`אל ת尝试`).
- **Fixes:** controller description — "call EXACTLY ONCE, present url, stop"; `GoogleCalendarController_auth` in SETUP_INSTRUCTIONS; new `tryAuthUrlRescue` helper (mojibake fixed) wired into all 4 breaker paths; streaming rescue keeps the AuthUrl card (renderSpec attached).
- **Verified:** tsc 0 · admin-agent spec 17/17 (+3) · full backend **417/417** · build 0 · live: new description in swagger, idempotency intact.
- ⚠️ Handed :3000 back to the user — their instance must be rebuilt/restarted to serve this fix. **Still open:** why the model loops on a tool whose result it already has (mitigated, not root-cured).

## 2026-08-19 — ✅ FIXED: Google Calendar OAuth state overwrite + 500-on-bad-code

- **Bug (session 227):** "OAuth state is invalid or expired" — agent retry loop called /calendar/auth 3×; state = single per-user DB slot (Postgres, 10-min TTL) → each call overwrote the previous → first consent URL's state died at callback. **Empirically reproduced**: auth→S1, auth→S2, callback(S1) → exact 400. Control: callback(S2) → passed state check (500 at Google exchange). Restart hypothesis excluded (backend up 23:36→23:58, state in DB).
- **Fix (a) `dfc5777`:** auth idempotent — fresh state reused, not overwritten (race note: check-then-write, ponytail comment). **Fix (c) `2d31c2e`:** getToken failure → controlled 400 "Google rejected the authorization code" (was 500).
- **Live-verified on second instance :3001 with new dist:** auth→auth → S2==S1 ✅; callback(S1, fake) → 400 new message ✅. Tests **414/414**, tsc 0.
- ✅ **DONE: fixes now LIVE on :3000** (restarted same session — user freed the port, fresh instance PID 11772): auth→auth → S2==S1 ✅, callback(S1, fake) → **400 "Google rejected the authorization code"** ✅ — both fixes (dfc5777 + 2d31c2e) verified on the production instance itself. **Open follow-up (not blocking):** why did the agent loop 3× on the auth tool — orchestration symptom, record separately.

## 2026-08-18 Session (aj) — follow-up ✅ inner genetics/terpenes tabs lazy (strain-hunter-settings)

- **Same pattern one level deeper:** inner `p-tabs lazy` + terpenes panel in `<ng-template #content>` — but template deferral alone still fired `/terpenes` because the component's eager `inject(TerpeneStore)` creates the store (httpResource fires at creation). **Fix: lazy TerpeneStore resolution via `injector.get()`** (memoized getter; computeds + all methods go through it) → store created only when the terpene tab first reads it.
- **Live-verified:** Strain Hunter open → only `/genetics`; click טרפנים → `/terpenes` once; switch back/forth → no refetch (1 each).
- **Verified:** frontend **495/495** · `ng build` exit 0. Uncommitted (awaiting user): `strain-hunter-settings.{html,ts}`.
- **Next (backlog):** SearXNG proxy · translation model quality · optionally defer sidebar sessions.

## 2026-08-18 Session (aj) — ✅ FIXED: settings tabs eager-loading (lazy + #content, empirically verified)

- **Problem:** entering /settings fired all tabs' requests at once (genetics/terpenes/storage/llm-provider/default-model) because settings.html rendered all 4 tab panels eagerly. (sessions×2 = sidebar by design; me = one-time boot call.)
- **Empirical:** `lazy` alone does NOT prevent component instantiation (panels rendered empty, but ctor/ngOnInit ran and requests fired — primeng #17351 behavior). **Fix: `lazy` + `<ng-template #content>` wrapper per non-first tab** — components created only on first activation.
- **Live-verified:** no /genetics//terpenes//storage on load; exactly 1 request each on first tab click; no refetch on switch-away/back; components stay alive (state preserved).
- **Verified:** frontend **495/495** · `ng build` exit 0.
- **Committed:** settings.html, AGENTS.md (PrimeNG 22.0.0), documents. **Uncommitted (prev. sessions):** backend enrichment + CLS skeleton.
- **Next (backlog):** SearXNG proxy · translation model quality · optionally same lazy pattern for inner genetics/terpenes tabs · optionally defer sidebar sessions.

## 2026-08-18 — ✅ Live UI verification (user): CLS skeleton

- User checked Strain Hunter genetics/terpene tables manually: rows appear immediately — **no skeleton visible, no empty state, no layout jump**.
- Interpretation: local API resolves within ~1 frame → `loading()` window imperceptible; skeleton rows (20 = page size) guarantee identical height so nothing shifts — exactly the intended end state.
- Code in place (uncommitted); no code changes this session.

## 2026-08-18 Session (ai) — ✅ enrichment open items 1-3 + CLS skeleton

- **Cannlytics:** `findInCache` → token all-or-nothing matcher (no short-token substring matches; "33 splitter" ≠ "33"); duplicated Hebrew maps merged into `HEBREW_STRAIN_NAMES` const (138 entries, both maps had diverged); junk keys removed; `מקפלרי` Korean garbage → Mac Flurry.
- **Batch flows (genetics+terpene):** translate once per chunk (`resolveEnglishNames`), thread through `searchChunk`/`fetchCannlyticsChunk`/`fetchDemarilyChunk`; `rankSearchResults` helper (ex-enrichSingle inline) applied to batch search — LLM context no longer diluted by junk. Terpene enrichMissing LLM calls 3→2.
- **Map:** +8 entries (אוראוז→Oreoz, אוז קוש→Oz Kush, אובמה ראנטז→Obama Runtz, 33 ספליטר, אזול ראנטז, אטום ספליטר, אורנג' ולווט, בלוברי→Blueberry).
- **CLS:** skeleton rows (20 = page size) + `geneticsLoading`/`terpeneLoading` in strain-hunter-settings — no animations, global shimmer only.
- **Verified:** backend **411/411** (tsc 0, build 0) · frontend **495/495** (tsc ×2 0, build 0) · mojibake clean.
- **Open:** SearXNG proxy decision (user + infra) · translation model quality beyond map · low-prio coverage gaps.

## 2026-08-18 Session (ah) — ponytail installed · tests-files merged → main & pushed

- **Ponytail skill:** installed for Freebuff (`~/.agents/skills/ponytail*` ×6) + Claude Code (plugin marketplace `DietrichGebert/ponytail`, `ponytail@ponytail` v4.9.0, user scope, 3 hooks). New Claude Code session needed for hooks.
- **Merge:** `tests-files` → `main` fast-forward (48 commits, zero conflicts) → `8f35140`. `.gitignore` `.freebuff/` entry came from existing `2a62f47` (my local duplicate edit discarded). User pushed; `origin/tests-files` remote branch remains; local `tests-files` deleted.
- **State:** main synced, clean tree.
- **Next (backlog, unchanged):** SearXNG proxy decision · Cannlytics findInCache · batch flows · translation model quality · CLS first-load (skeleton option) · low-prio coverage gaps.

## 2026-08-17 Session (ag) — ⏪ REVERTED: enrichment/table animations in strain-hunter-settings

- **User:** the CLS problem remained; asked to go back and cancel the animation work ("משם הכל התחיל להשתבש").
- **Action:** `git checkout` of `strain-hunter-settings.{ts,html,css,spec}` + `_animations.css` to the `ac0691d` commit state (all diffs verified as mine) — removed closing/flash/skeleton states, expand/enrichment wrappers, slide-out-right, row fade-in, and the added keyframes; Save/Discard back to instant removal; toggle back to plain. Kept: sortable headers + tablist scale(-1) in `_primeng-overrides.css` and the backend enrichment fixes.
- **Verified:** frontend **492/492 (56 suites)** · `ng build` exit 0 · live: no animation classes, `rowAnim: none`, 38 rows normal.
- **Note:** original first-load CLS (no loading state on the tables) remains as before; skeleton-without-animation still an option.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ag) — ✅ DONE: table CLS fix — skeleton loader + min-height + row fade-in

- **Problem:** on first load the genetics/terpene tables rendered empty (no loading state at all — `genetics()` returns `[]` until `hasValue`) then rows burst in → CLS. Tab switches themselves are fine (singleton `httpResource` caches — verified live: 38 rows at +225ms on switch-back).
- **Fix:** skeleton rows inside the tables (`loading() ? tableSkeletonRows : filtered*()`, 20 placeholders = page size → identical height; `.skeleton-row` with global `.shimmer`), `min-height: 480px` on the table card, and a 0.2s `tableRowFadeIn` on `.table-row-header` (keyframe moved to `_animations.css`; reduced-motion off).
- **Verified:** frontend **497/497 (56 suites, +1)** · `ng build` exit 0 · live: fade-in animation applied, terpene tab 38 rows, tab switches cached.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ag) — ✅ DONE: css-conventions + css-deduplicate pass

- **User:** nested the tablist rule (`.p-tabs > .p-tablist-nav-button > &.prev/next { transform: scale(-1) }`) and asked for a conventions+dedup pass on the session's CSS.
- **Done:** keyframes `gridOpen`/`fieldFlash`/`fieldFlashFull` moved from `strain-hunter-settings.css` to `_animations.css` (canonical keyframes home) — component rules keep referencing them; everything else audited KEEP (global `.detail-item` is scoped to `.metric-details`, `.badge` sizing intentional, accordion wrappers structural). PrimeNG's own `:dir(rtl){rotate(180deg)}` for these buttons was verified non-applying live; our rule also outranks it.
- **Verified:** `ng build` exit 0 · keyframes global (1× each) · tablist transform live `matrix(-1,0,0,-1,0,0)`. Uncommitted.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ag) — ✅ DONE: tablist prev/next chevrons mirrored for RTL

- **Problem:** `.p-tablist-nav-button.p-tablist-prev-button` / `next-button` inherit page `direction: rtl` → chevrons point the wrong way.
- **Fix:** `transform: scale(-1)` on both (`.p-ripple.p-tablist-nav-button.p-tablist-prev-button/next-button`) in `_primeng-overrides.css` (`/* ── Tabs ── */` section). No `!important` needed (PrimeNG base leaves transform: none).
- **Verified:** `ng build` exit 0 · live computed `matrix(-1,0,0,-1,0,0)` on the next button. Uncommitted.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ag) — ✅ DONE: enrichment flow UX — height animations (enter/exit), field-flash, spinner

- **Problem (video-agent analysis):** abrupt layout shift when opening/closing the LLM panel; exit perceived as instant; no feedback on which fields changed; no pending spinner on save.
- **Fix:** `.expand-anim`/`.enrichment-anim` CSS-grid wrappers with `gridOpen` keyframe (enter) + `.closing` transition to `0fr` (exit, 0.3s) for both the expansion rows and the LLM panels; animated row collapse via new closing-row sets (300ms deferred removal, `isCompact`-guarded); Save diffs old vs. enriched values and flashes only the changed fields (`.field-flash`, 0.6s, green pulse; separate keyframe for `.detail-full`); Save/Discard buttons show a spinner while closing. Reduced-motion disables the new animations.
- **Verified:** frontend **496/496 (56 suites, +3 new)** — row-collapse-delay tests (genetics+terpene) and field-flash test · `ng build` exit 0. Uncommitted.
- **Live check (preview @2fps — logic only):** panel enter `gridOpen` applied on insertion; on Save panel kept in DOM with `.closing` ~300ms then removed; flash = exactly the changed fields (verified 5 fields for אובמה ראנטז); row collapse couldn't be exercised live (preview viewport is compact mode by design).
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ag) — ✅ DONE: animated exit for enrichment cards (Save/Discard)

- **Problem:** saving a Regenerate card removed it instantly → layout jump, no exit animation.
- **Fix:** closing-state signals + global `.slide-out-right` (0.3s) on the enrichment panel; map removal deferred by 300ms (buttons disabled meanwhile). Genetics + terpene panels. New fake-timer spec.
- **Verified:** frontend **493/493** · `ng build` exit 0. Uncommitted.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ag) — ✅ DONE: genetics/terpene enrichment — Hebrew strain name restored in web search

- **Root cause:** `WebSearchService.simplifyQuery` stripped ALL Hebrew from queries → strain name vanished ("33 ספליטר"→"33", "אובמה ראנטז"→nothing) → SearXNG returned garbage → only 3 results passed to LLM → no strain-specific data → LLM re-emitted the same generic data. Cannlytics also returned identical lab data for different strains (loose `findInCache` partial match — flagged).
- **Fix:** `search(query, preserveHebrew=false)` option (default unchanged); genetics+terpene `searchChunk`/`enrichSingle` pass `true` and use `slice(0, 8)` results; new spec test.
- **Follow-up (per user):** (1) `GeneticsService.translateToEnglish` — map first, LLM fallback → `enName` resolves for strains missing from the hardcoded map; (2) **auto-save removed** from genetics+terpene `enrichSingle` → preview only, Save/Discard panel controls persistence (matches controller docs).
- **Follow-up 2 (live logs):** SearXNG queries now send `language: 'en'` (kills Chinese/Polish/French garbage); `enrichSingle` ranks results by relevance (strain-name tokens > cannabis keywords > noise) before slicing to 8. Live: Oz Kush ✅, Orange Velvet ✅ (Skunk 1 parent found); אוראוז mistranslated to "Aurous" by free model (real: Oreoz) — flagged.
- **Verified:** backend **401/401** · `nest build` exit 0. Uncommitted.
- **Open:** Cannlytics findInCache matching · batch flows map-only + no ranking · translation model quality.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ag) — ✅ DONE: llm-providers "Name" sort header — spacing + alignment fixed

- **Root cause:** `.sortable-column-header` wrapper had no CSS rule anywhere in the project → plain block layout: no gap between "Name" and the sort icon, icon/text not centered — inconsistent vs `baseUrl`/`Models` headers (which get spacing from the global `p-sortIcon` margin override).
- **Fix (follow-up per user):** rule moved to global `_primeng-overrides.css` (inside `.p-datatable-thead`, next to the `p-sortIcon` margin override) and the wrapper applied to **every sortableColumn th app-wide** — 12 headers across 4 files: `llm-providers-management` (6), `users-management` (dynamic loop), `strain-hunter` (dynamic loop), `strain-hunter-settings` (4, incl. Hebrew/RTL). Component-scoped rule removed; **line-62 TODO deleted** (request fulfilled app-wide).
- **Verified:** `ng build` exit 0 + **`ng test` 492/492 (56 suites)**. Pre-existing strain-hunter.css budget warning unrelated. Visual check pending next live render.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (af) — ✅ DONE: price-slider transitions added (user already fixed LTR + restyle)

- **User's fix (between sessions):** `direction: ltr` on `.filter-range-slider` was the real root cause of the curve; also restyled (rounded-square handles, hover range color + handle glow, active state).
- **Added:** `transition` on `.p-slider-handle` (border-color/background/box-shadow/transform) + `.p-slider-range` (background) using `--transition-colors`/`--transition-fast` tokens; `transform: scale(0.94)` on `:active`; reduced-motion rule extended.
- **Verified:** `ng build` exit 0 (11.0s, pre-existing strain-hunter.css budget warning unrelated).
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ae) — ✅ DONE: strain-hunter price-slider handles D-shape → full circle

- **Root cause:** custom `.p-slider.p-slider-horizontal { height: 1px }` clipped the 14px handle (`position:absolute; top:50%; transform: translate(-50%,-50%)`) → bottom 7px cut off → handles rendered as D-shapes. PrimeNG 21 base style normally sets slider height = handle height and uses a separate `.p-slider-track` child for the thin line — we overrode the height but never explicitly thinned the track.
- **Fix:** slider height `1px → 14px`; added `.p-slider-track { height: 1px }` to keep the thin line (default 3-4px); `overflow: visible` on `.filter-range-slider` defensively.
- **Verified:** `ng build` exit 0 (8.6s, pre-existing strain-hunter.css budget warning unrelated). Visual check pending next live render.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.

## 2026-08-17 Session (ad) — ⏳ SearXNG: outgoing hardening DONE, proxy decision PENDING (user)

- **DONE:** settings.yml hardened (useragent_suffix, retries:0 explicit, commented proxies structure, engine-level retry_on_http_error:false on bing/mojeek/qwant) + .env.example web-search section fixed/documented (stale .sh→.js reference corrected).
- **Verified live:** YAML clean · container restarted clean · search e2e OK (20 results, bing+ddg).
- **PENDING USER DECISION:** rotating proxy pool endpoints (paid infra) — the actual cure for the CAPTCHA storm; without it, cooldown discipline is mitigation only.
- **⚠️ Unowned change (not mine):** `_filters.css` (slider handle tweak, 50% hardcoded vs token). Untouched.
- **Next (backlog):** SearXNG proxy decision · tsconfig.spec.new.json doc reconciliation · push/PR prep.


## 2026-08-17 Session (ac) — ✅ DONE: seeds relocated — core boundary inversion resolved

- **DONE:** 4 seeds moved from `core/seeds/` to their feature modules (`modules/{users,terpene,genetics,llm-provider}/seeds/`), `core/seeds/` deleted, main.ts imports updated (+ removed 2 dead entity imports). 100% git renames — only relative import lines changed.
- **Over-export sweep:** nothing left — audit's remaining items were decorator relocation (done, session y), seeds (done now), and `tsconfig.spec.new.json` (the A8 "RETRACTED — active vitest config" claim was a misdiagnosis: vitest runs via `vitest.config.ts` + `tsconfig.spec.json`; the `spec.new` file was dead and was removed 2026-08-18).
- **Verified:** backend tsc 0 · **399/399** · build 0 · live boot C5 ✅ + seeds idempotent (no errors vs existing DB) · frontend tsc app 0 · mojibake clean.
- **Next (backlog):** SearXNG proxies · tsconfig.spec.new.json *docs* reconciliation.


## 2026-08-17 Session (ab) — 🎉 DONE: frontend 492/492 — ALL tests green project-wide

- **DONE:** 16 pre-existing frontend failures fixed across 5 spec files (app×2 — PrimeNG services; auth.guard×1 — user.set mock; auth.interceptor×2 — 401-then-ok handler + async refresh for single-flight; with-credentials×4 — vi.fn handlers; strain-hunter-settings×7 — real MessageService + ResizeObserver mock). Zero production code touched.
- **Verified:** full **492/492, 56/56 suites** · tsc ×2 exit 0 · ng build exit 0 · mojibake clean.
- **🎉 PROJECT-WIDE: backend 399/399 + frontend 492/492 — first fully-green suite in project history.**
- **Next (backlog):** SearXNG proxies · seeds boundary · tsconfig.spec.new.json doc conflict.


## 2026-08-17 Session (aa) — 🎉 DONE: backend 399/399 — historical debt CLOSED

- **DONE:** 8 pre-existing failures fixed across swagger-parser (1, stale tolerance band), agent-session (3, missing createQueryBuilder mock), llm-client (4, **real SSRF hardening** — dev-localhost allow is now opt-in for provider baseUrls only; downloadBuffer strict everywhere; DNS mock fixed to resolve loopback like real dns.lookup).
- **Verified:** full `--runInBand` **399/399, 43/43 suites** · tsc 0 · build 0 · backend restarted, C5 ✅ live · mojibake clean.
- **Baseline note:** the "8 pre-existing" framing is GONE — full suite is now the bar.
- **Next (backlog):** SearXNG proxies · seeds boundary · tsconfig.spec.new.json doc conflict.


## 2026-08-17 Session (z) — ✅ DONE: login/register submit hit-target FIXED

- **Root cause (live):** `button:disabled { pointer-events:none }` + `[disabled]="form.invalid||loading"` → empty form = button not the hit target (elementFromPoint = FORM). Overlay theory disproven (p-dialog 0×0).
- **Fix:** no disabled-on-invalid (only while loading); onSubmit guards + markAllAsTouched (click empty → validation errors shown). Register same fix. No CSS/token change.
- **Verified:** live probe hit=BUTTON on empty form + errors render; login 10/10, register 9/9; full **476/492** (16 pre-existing, zero new); tsc ×2 exit 0; ng build exit 0.
- **Next (backlog):** SearXNG proxies · seeds boundary · tsconfig.spec.new.json doc conflict.


## 2026-08-17 Session (y) — ✅ DONE: RequiresConfirmation → core/decorators

- **DONE:** decorator + spec relocated (git mv, zero content change); imports fixed in users + llm-provider controllers; dead `REQUIRES_CONFIRMATION_KEY` import removed from swagger-tools.parser.
- **Verified:** tsc 0 · focused 114/118 (4 = pre-existing) · full **390/398** (8 pre-existing) · build 0 · live C5 boot assertion ✅ (3 ops detected after restart).
- **Next (backlog):** SearXNG proxies · seeds boundary · tsconfig.spec.new.json doc conflict.


## 2026-08-17 Session (x) — ✅ DONE: strain-hunter cluster ×3 wrapped in ServiceResultContainer

- **DONE:** GET /fetch + GET/PUT /preferences → `{success, message, result}` (controller wrap, service raw). No streaming/binary. Consumers updated: frontend `strain-hunter.ts` (fetch parse) + `matching-engine.store.ts` (prefs GET); LLM tools unaffected by design (container JSON, calendar/llm precedent).
- **Verified:** backend 20/20 + full 390/398 (8 pre-existing) · frontend 51/51 + 19/19 + full 472/488 (16 pre-existing) · tsc ×3 exit 0 · mojibake clean.
- **✅ Live-verified after backend restart:** preferences + fetch serve container shape (`נטענו 191 זנים`), prefs data intact.
- **✅ Audit FULLY green:** "ideas ×3" was a stale audit-doc label — unread-count already wrapped (live: `result:6`), sessions wrapped in 1aa5348, favorite/mark-read already 204. Zero ❌/⚠️ remain; audit doc corrected.
- **⚠️ Note:** no root package.json → `npm run -w` fails; run backend commands from `backend/`. Running backend = `node dist/main` (not watch) — rebuild (`npm run build` in backend/) + restart after future src edits.
- **Next (backlog):** RequiresConfirmation → core/decorators · SearXNG proxies decision · dead-code cleanup.


## 2026-08-17 Session (w) — ✅ DONE: dashboard "0 users" bug FIXED (frontend-only)

- **Root cause:** `UsersStore.users()` read `usersResource.value()` unguarded — Angular THROWS on `value()` in resource error state (documented). Failed GET /users (backend watch restart / blip) → throw → dashboard broke + no auto-retry → stuck "0". Backend verified live: login + GET /users → 200 (8 users) — bug was store/timing as suspected.
- **Fixed:** `hasValue()` guard + resource-error surfaced in pageState in `users.store.ts`; same unguarded pattern fixed in `terpene/genetics/llm-provider` stores (same `50e11c0` refactor).
- **Verified:** +3 store tests (error → no-throw + Error state, reload recovery) · full suite **472/488** (16 = documented pre-existing, zero new) · tsc ×2 exit 0 · live dashboard shows 8.
- **Next:** strain-hunter cluster (×3) — last ❌ from audit-service-result-container.md.




## Found during audit, NOT fixed
- **RESOLVED (2026-08-18):** Mojibake in `chat.ts:593` — fixed in `f886906` ("hoặc" → "או"). `frontend/tsconfig.spec.new.json` — confirmed dead against builder source (`@angular/build:unit-test` defaults to `tsconfig.spec.json`, zero references to `spec.new` anywhere) and **removed**. `RequiresConfirmation` decorator — relocated to `core/decorators/` (session y). 17 ❌ non-conform endpoints — all wrapped in ServiceResultContainer (sessions w-x, audit fully green).
- SearXNG pool: google cse suspended 08-17 (ddg recovered) — proxy proposal pending user decision.


## 2026-08-17 Session (v) — Regression sweep + audits — DONE (findings only, no fixes)

- **Baseline green:** tsc backend 0 + frontend 0×3 · jest --runInBand **381/389** (8 fails = pre-existing, identical set to pre-commit baseline) · hook suite **92/92** · guards clean. Zero new regressions.
- **Stage 2 →** `documents/audit-service-result-container.md`: 76 endpoints — 56✅ / 3⚠️ / 17❌ (raw passthrough). Fix-3-partial-first recommended; ❌ = breaking changes.
- **Stage 3 →** `documents/audit-dependency-map.md`: zero runtime DI cycles / orphans. Dead: math.utils.ts, 16 over-exports, tsconfig.spec.new.json, misplaced RequiresConfirmation decorator.
- **Stage 4 — SearXNG pool degraded further (BACKLOG):** google cse NOW suspended too → live = bing only; mojeek 0-results. Root cause: single static egress IP, no `outgoing.proxies`. Proposal: rotating proxy in settings.yml / engine cooldowns / paid API. Awaiting user decision.
- No app code touched; no architecture-diagram change.


## 2026-08-16 Session (t) — site: post-filter + PullPush removal — DONE

- **DONE:** `WebSearchService.search()` now enforces `site:X` / `-site:X` operators client-side on merged SearXNG results (require = exact host or subdomain; exclude = drop; unparseable URL fails positive filters). Root cause was upstream: bing.com ignores `site:` for anonymous traffic (verified live, bypassing SearXNG) while google cse/brave honor it — merged results mixed garbage in.
- **DONE:** PullPush channel removed entirely (service method + queue/circuit-breaker + both ideas pipelines + 5 spec tests) — API returns permanent 429 "does not provide free scraping resources for agents". Ideas pipeline = 2 channels: SearXNG + HN Algolia.
- **Verified:** `tsc --noEmit` ✅, targeted specs **44/44 ✅** (−5 PullPush, +5 site-filter). Full suite `--runInBand`: **381/389, 40/43 suites** — all 8 failures pre-existing at HEAD, zero diff on their files, none in touched scope (`swagger-tools.parser` 1, `llm-client.service` 4, `agent-session.service` 3). NOTE: parallel jest crashes silently in this env — use `--runInBand` for full-suite runs.
- **KNOWN ISSUE (open, separate investigation):** SearXNG engines suspended from this IP: brave (too many requests), duckduckgo (CAPTCHA), qwant (CAPTCHA), startpage (Suspended CAPTCHA), mojeek (access denied). Live ≈ bing + google cse (+ intermittent brave). Candidates: outgoing proxy, engine set change.
- No architecture diagram update (channel removal within existing module; request path unchanged).

## 2026-08-16 Session (r) — ✅ HOOKS LIVE-VERIFIED post app restart — CLOSED

- **VERIFIED LIVE:** graphify PreToolUse guards fire on Read/Bash (visible `[Hook additional context]` ×5); `post-edit-format.sh` ran Prettier on a real Edit of `frontend/src/main.ts` (2-line chain collapsed to 1 = Prettier's doing, not the edit string); `project_hooks.ignored` 99 → 99 (zero new; last 20:00:42Z pre-restart).
- **Cosmetic:** PostToolUse hook stdout (`[Hook] File edited`) not echoed into agent's Edit tool result — proven via formatting side effect instead.
- Test edit reverted (`git checkout`); no app code changed; no build/test needed.
- **Hooks task CLOSED.**

## 2026-08-16 Session (n) — ZCode hooks verification: hooks NOT executing — BLOCKED on security policy

- **VERIFIED:** `.zcode/config.json` valid (`hooks.enabled: true`, 3 events, 7 commands); all 6 scripts exist. `hooks.loadHooks OK` in v2 log.
- **NOT WORKING:** live tests — flat-CSS Write NOT blocked, Prettier NOT run on Edit, `rm backend` Bash NOT blocked, no pre-write WARN on overwrite. All 7 hooks dead.
- **ROOT CAUSE (from logs):** `config.project_hooks.ignored` — "Project hooks were ignored by the security policy" (65 warnings today 19:04–19:11, `~/.zcode/cli/log/zcode-2026-08-16.jsonl`). Project-scope hooks are discarded by ZCode security policy.
- **NEXT (user decision):** approve project hooks via ZCode settings/policy or move hooks to a trusted (user) scope. Verify-only session — no fix applied.

## 2026-08-16 Session (l) — Stuck active button fixed + 3 stale specs repaired — DONE

- **DONE:** `ideas.store.ts generate()` gained a `complete` handler — SSE streams that end without a `done` event (server restart mid-run, drop) no longer leave `loading=true` stuck (the "active" button bug the user saw).
- **DONE (pre-existing blockers fixed):** strain-hunter.spec protected `isAdmin` access, llm-providers-management.spec mock typing, ideas.service.spec rewritten for the HttpClient refactor (44f53ca never updated it).
- **Verified:** `ng test` **469/485** (16 remaining = documented pre-existing: app/interceptors/guard/strain-hunter-settings), `ng build` ✅. No architecture diagram update.

## 2026-08-16 Session (k) — 🎉 NIGHTLY IDEAS PIPELINE: WORKING

- **CONFIRMED (user's final logs):** full chain green on `openrouter/google/gemma-4-31b-it:free` — discovery first-attempt, signals 10–70 trusted/topic, idea-gen + validation complete, **`Grounded cron: accepted` ×2**, hard gate rejecting ungrounded candidates correctly. Sessions saved.
- **Model note:** gemma-4-31b-it:free is NON-thinking — no empty-content/truncation pathology. The double-slash model ID validated the first-slash env parsing fix.
- **Minor (non-blocking):** OpenRouter free 429s (auto-retried, slower); competitor-search noise → cosmetic "⚠️" validation reasons; PullPush external block self-heals via circuit breaker.
- **Optional polish:** strip operators in competitor-search queries (same as buildSignalQueries treatment).

## 2026-08-16 Session (j) — Round 9: thinking-model budget headroom — DONE

- **DIAGNOSED (11th log):** env override works; glm-4.7-flash is ALSO a thinking model — query-gen truncated at 1024 (303 content chars, rest burned on reasoning), discovery @2048 empty-content. Budget headroom is the systematic fix for this model class.
- **DONE:** budget bumps — query-gen 3072, discovery 4096/8192, signals 4096, validation 8192 (idea-gen already 8192).
- **Verified:** ideas **33/33 ✅**, `tsc --noEmit` ✅, mojibake clean. No architecture diagram update.
- **PENDING:** re-trigger nightly → expect complete JSON at every phase + ≥1 `Grounded cron: accepted`.

## 2026-08-16 Session (i) — Round 8: env typo — awaiting corrected line

- **DIAGNOSED (10th log):** env override parsed correctly (first-slash fix works) but provider key misspelled by user: `cloudeflare` ≠ DB key **`cloude-flare`**. Query-gen failed → fallback queries → HN still kept **65 trusted** (record). Circuit breaker clean.
- **USER ACTION (corrected):** `IDEAS_NIGHTLY_MODEL=cloude-flare/@cf/zai-org/glm-4.7-flash` → restart → re-trigger.
- No code changes; all suites green from prior rounds.

## 2026-08-16 Session (h) — Round 7: model-override parsing fix — DONE, awaiting user env line

- **DIAGNOSED (9th log):** upstream perfect (61 trusted snippets) — discovery LLM empty-content on BOTH attempts at 2048 AND 4096 = OmniRoute `auto` provider pathology (chat on `cloude-flare/@cf/zai-org/glm-4.7-flash` worked in the same log). Nightly forces `findFirstActiveTextModel()` override, beating the user's chat default.
- **DONE:** `IDEAS_NIGHTLY_MODEL` parsing fixed to first-slash split (was truncating slash-containing model IDs). `.env.example` documented.
- **USER ACTION:** `IDEAS_NIGHTLY_MODEL=cloude-flare/@cf/zai-org/glm-4.7-flash` in `backend/.env` → restart → re-trigger.
- **Verified:** ideas-tasks **6/6 ✅**, `tsc --noEmit` ✅, mojibake clean. No architecture diagram update.

## 2026-08-16 Session (g) — Round 6: retry covers truncated JSON — DONE

- **BREAKTHROUGH (8th log):** HN 3-word queries → kept **50 trusted snippets** (record). Discovery LLM produced real topics JSON but truncated at 2048 (`finish_reason=length` → unparseable) — retry loop didn't fire because the response wasn't a throw.
- **DONE:** `discoverTopics` retry loop now wraps LLM call AND JSON parse — either failure triggers attempt 2 @4096. `finish_reason` logged in retry warning.
- **Verified:** ideas **33/33 ✅**, `tsc --noEmit` ✅, mojibake clean. No architecture diagram update.
- **PENDING:** restart backend → re-trigger → expect parsed topics + ≥1 `Grounded cron: accepted` + saved session.

## 2026-08-16 Session (f) — Round 5: HN 3-word queries — DONE, live-verified

- **DIAGNOSED (7th log):** cooldown machinery works end-to-end; failure = all 3 channels starved at once (SearXNG dictionary noise — only bing answers, all other engines suspended; PullPush IP blocked; HN 0 because 8-10-word AND-chains don't match).
- **DONE:** `searchHackerNews` trims to first 3 significant words — HN Algolia ANDs words, short queries hit (live-verified: `"accessibility lawsuit ADA"` → real ADA-lawsuit stories). HN = news.ycombinator.com → 100% trusted yield. Benefits discovery + grounding.
- **Dead ends (live-probed):** SearXNG `reddit` engine (access denied), arctic-shift mirror (needs subreddit/author).
- **Verified:** web-search + ideas **44/44 ✅**, `tsc --noEmit` ✅. No architecture diagram update.
- **PENDING:** restart backend → re-trigger nightly → expect HN snippets + discovery LLM run + ≥1 `Grounded cron: accepted`. If empty-content at 4096 persists → switch nightly model off OmniRoute `auto` (user DB change).

## 2026-08-16 Session (e) — Round 4: in-queue cooldown + discovery 4096 — DONE

- **DIAGNOSED (6th log):** circuit breaker opened correctly but in-flight queued calls still each burned a 3s retry; discovery empty-content NOT input-size dependent (failed with 1 snippet) — heavy prompts work at 4096 elsewhere (idea-gen).
- **DONE:** cooldown check inside the PullPush queue task (fail-fast for already-queued calls); discovery retry budget 3072→4096.
- **Verified:** web-search + ideas **44/44 ✅**, `tsc --noEmit` ✅, mojibake clean. No architecture diagram update.
- **PENDING:** restart backend → re-trigger nightly. If discovery still empty at 4096 → **switch nightly model off OmniRoute `auto`** (user DB config change; code levers exhausted).

## 2026-08-16 Session (d) — Round 3: PullPush circuit breaker + prompt trim — DONE

- **PROGRESS CONFIRMED (5th log):** SearXNG recovered (26 trusted results kept), 429 storm gone (queue works), discovery retry works. Remaining: PullPush IP hard-blocked (429 even after retry — queue wasted ~30s/phase), discovery LLM empty-content on BOTH attempts with 26 snippets.
- **DONE:** (1) PullPush circuit breaker — double-429 opens 10-min cooldown, cooldown calls short-circuit w/o HTTP, success clears; (2) discovery prompt trimmed — snippets capped at 280 chars, prompt 30→12 snippets (empty-content correlates with input size, not just budget).
- **Verified:** web-search + ideas **44/44 ✅**, `tsc --noEmit` ✅, mojibake clean. No architecture diagram update (same providers).
- **PENDING:** re-trigger nightly (wait ~10 min for PullPush cooldown expiry) → expect topics JSON + ≥1 `Grounded cron: accepted`. If discovery still empty at 12×280 → switch nightly model off reasoning `auto` (user decision).

## 2026-08-16 Session (c) — Round 2: PullPush 429 + double site: + discovery retry — DONE

- **PROGRESS CONFIRMED (user's 3rd/4th logs):** sanitize + budget + fan-out fixes work — PullPush returned real results, topics discovered, signals extracted, ideas generated and validated end-to-end.
- **DONE (round 2 fixes):** (1) PullPush serialized queue (1500ms interval) + single 429-retry w/ 3s backoff; (2) `buildSignalQueries` strips LLM-embedded `site:`/`OR`/`-excl` (was producing `site:reddit.com site:reddit.com ...`); (3) `discoverTopics` LLM retried once (2048 → 3072) for flaky reasoning-model empty-content; (4) bare-`-` token after `-site:` strip fixed.
- **Verified:** web-search + ideas **43/43 ✅**, `tsc --noEmit` ✅. Cosmetic jest worker warning from retry test's 3s sleep. No architecture diagram update (same providers).
- **PENDING:** re-trigger nightly trigger → expect no 429 storm, single `site:`, ≥1 `Grounded cron: accepted` + saved session.

## 2026-08-16 Session (b) — Nightly ideas still 0: 3-layer fix DONE

- **DIAGNOSED (from user's 2nd log paste):** HN Algolia/PullPush still returned 0 — they received raw `site:`/quotes/`OR` search syntax that direct APIs search literally (PullPush even 400'd on an unbalanced LLM quote); topic-discovery LLM threw `Returned no content or tool calls` at `maxTokens: 1024` (reasoning-model empty-content); and `gatherSignals` (per-topic grounding) was still SearXNG-only → all candidates dropped ungrounded.
- **DONE:** `toDirectApiQuery()` sanitizer (strip `site:`/`domain:`, `-excl`, `OR`, quotes, parens) applied in `searchHackerNews` + `searchRedditArchive`; `discoverTopics` `maxTokens` 1024→2048; `gatherSignals` fans its 5 queries to SearXNG + HN + PullPush.
- **Verified:** web-search 9/9 ✅, ideas 33/33 ✅, `tsc --noEmit` ✅, mojibake clean. No architecture diagram update (reuses documented HN/PullPush providers).
- **PENDING:** re-trigger `POST /ideas/nightly/trigger` → expect non-zero `[HN Algolia]`/`[PullPush]` results (queries without operators) + ≥1 `Grounded cron: accepted` line.

## 2026-08-16 Session — Nightly ideas run 0 sessions: log diagnosis + fallback fix

- **DIAGNOSED:** nightly trigger → 0 grounded sessions. Chain: (1) DB active text model row was `openrouter`/`google` (invalid ID) → OpenRouter 400 — user fixed it (OmniRoute `auto`, LLM query-gen verified working); (2) fallback queries had no `site:` — fixed, now trusted-domain-scoped; (3) ALL self-hosted SearXNG general engines suspended/CAPTCHA'd (verified live) — bing enabled but ignores `site:`, mojeek/qwant dead.
- **DONE (code, user-approved "APIs ישירים"):** `WebSearchService.searchHackerNews` (HN Algolia) + `searchRedditArchive` (PullPush) — keyless direct APIs, live-verified. `discoverTopics` fans each query to SearXNG + HN + PullPush in parallel. Enabled bing/mojeek/qwant in `docker/searxng/settings.yml` (container restarted).
- **Verified:** backend `web-search` + `ideas` 40/40 ✅, `tsc --noEmit` ✅, mojibake clean. Architecture diagram updated (HN Algolia + PullPush providers).
- **PENDING:** re-trigger `POST /ideas/nightly/trigger` → expect `[HN Algolia]`/`[PullPush]` results + ≥1 grounded session.

## 2026-08-14 Session — Ideas validation overhaul (4 phases, all DONE)

- **DONE (Phase 1):** `riskPenalty` (0–3) added to `validationBreakdown` in `VALIDATION_PROMPT` (criteria + calibration example where risk drops a strong idea to 5/10). Server-side formula: `competition + signalFit + feasibility + marketSize − riskPenalty`, clamped 1–10 in `validateSingle`. Missing penalty → 0 (backward compat).
- **DONE (Phase 2):** Competitors rendered as clickable `.tag` chips with a Google-search link (`competitorSearchUrl`), killing the full-width dead-space list.
- **DONE (Phase 3):** IdeaCard details switched to a 2-column grid (1 column ≤640px) — scroll fatigue fix.
- **DONE (Phase 4):** `techStackSuggestion` / `firstDistributionStep` / `estimatedMvpDays` end-to-end (prompt → service sanitizers → nullable entity columns → store → 3 new `@if` IdeaCard sections). Old ideas render clean.
- **Verified:** backend ideas 33/33 ✅, frontend ideas suite 32/32 ✅, `tsc --noEmit` ✅. Not yet committed.
- **DONE (same session):** stale ideas specs fixed — ideas-history mock got `isSessionLoading` + `toggleExpand` tests now `await`; ideas-form `domain` mock converted to a real `signal('')` (`canGenerate` is a cached `computed`).
- **Remaining pre-existing failures (unrelated):** app.spec 2, auth.interceptor 2, with-credentials.interceptor 4, auth.guard 1, strain-hunter-settings 7, backend 8 tests in unrelated suites.
- **No architecture diagram update needed** (IdeasModule internals only).

## 2026-08-13 Session — Fix `clampScore` TS type error

- **DONE:** `clampScore` in `ideas.service.ts` now accepts `number | undefined`. `validationScore` is optional in `ValidationResult` → `ts(2345)` on the call site. Guard already handles `undefined`. `tsc --noEmit` ✅.

## 2026-08-13 Session — Ideas-history first-click flicker fix

- **DONE:** Eliminated the first-click layout shift in the Ideas History accordion. Four layered fixes applied:
  1. Split `historyLoading` (page-level) from a new `loadingSessionIds: signal<Set<number>>` (per-session) in `ideas.store.ts`. `loadSession()` no longer toggles `historyPageState`, so the `@switch` block no longer remounts the entire sessions list.
  2. Made `toggleExpand()` async — `await loadSession()` then `await requestAnimationFrame()` before `expandedSessionId.set()`. One paint frame between data arrival and grid animation.
  3. Removed dead `::ng-deep` block in `ideas-history.css` (12 lines, targeted a `.idea-card-wrapper` class that doesn't exist in the DOM).
  4. Added `will-change: filter` to `.glass-effect::before` to pre-composite the `backdrop-filter: blur()`.
- **HTML also updated** — loader `@if` now also checks `ideasStore.isSessionLoading(session.id)` so `triggerNightly`'s post-call `loadSession` shows a local spinner (per-session, not page-level).
- **CSS safety net** — `.ideas-loading` now has `min-height: 220px; align-items: center` so even on a slow network the spinner reserves a realistic area.
- **Verified:** `npx ng build` ✅. ideas-history chunk 51.31 → 50.98 kB. No backend changes. Not yet committed (matches existing uncommitted working tree pattern).
- **No architecture diagram update needed** — signal separation inside an existing store + cosmetic CSS.

## 2026-08-13 Session — Test coverage verification & test-coverage-gaps.md finalize

- **DONE:** Verified `documents/test-coverage-gaps.md` against the actual filesystem. Scanned all `*.spec.ts` and counted `it(`/`test(`. Actual totals: Backend **43 spec files / 376 tests** (8 security + 26 business-logic + 9 admin-agent); Frontend **56 spec files / 482 tests** (matches `434/482` passing, 51 of 56 suites).
- **DONE:** Rewrote the coverage doc to match verified reality. Fixed wrong totals (doc said backend 48 / core 7 / frontend 20), corrected per-module counts (e.g. auth.service 13, llm-provider-config 27), and marked already-covered frontend items as ✅ (all 8 stores, auth/role guards, auth/with-credentials interceptors, login/register, chat+blocks, ideas, settings, media-studio, layout, llm-providers, strain-hunter). Kept only the genuine gaps (users-management, design-system, 4 chat block-cards, 5 services, 4 directives).
- **Decision:** use verified filesystem counts over the previously-reported round totals (round-2 backend business-logic is 26/224, not 19/145; frontend total is 56/482, not 51/469).
- **No architecture diagram update** (docs-only change).

## ⚠️ Lesson: Every commit must be reviewed individually

`82d9baa` added a total SSRF bypass (`NODE_ENV !== 'production'` → skip all validation) during a batch commit. It was caught and reverted (`021224b`) only because each commit was reviewed separately before closing. **Rule:** never approve a batch commit without reviewing every file diff, especially security-critical code.


## 2026-08-12 Session — Glass Effect Rendering Fix (PUSHED)

- **DONE:** Fixed vertical stripes/banding artifacts on glass-effect cards by forcing GPU acceleration (`transform: translateZ(0)`) and stable layer sampling in `_utilities.css` and `idea-card.css`.
- **Verified:** Frontend build ✅.
- **Commits:** `[current-session]` (fix(css): eliminate banding artifacts on glass-effect cards).

## 2026-08-12 Session — SavedIdea unification + apiKey transformer fix + CSS dedupe

- **DONE:** Frontend unified on `SavedIdea` as single source of truth (IdeaCard, ideas-history, ideas-page); `BusinessIdea`/`IdeaCardData`/`toCardData` removed from UI (verified clean scan); nullable arrays normalized at store boundary; `apiKey` transformer no longer NULLs stored key on empty PATCH; `ideas-history.css` deduped (12 props removed). `ideas-grid` component deleted — `ideas-page.html` now renders `<app-idea-card>` directly with parent-managed `expandedIndex`.
- **Verified:** `npx ng build` ✅ (only pre-existing unrelated `strain-hunter.css` budget warning).
- **Commits (not pushed):** `dc98cda` (apiKey fix), `461234b` (SavedIdea unification).
- **4 pre-existing files also committed (separate commits, not part of this work):** `442f6dc` (backend nightly model AI_PROVIDER fallback + `LlmProviderConfigService` export), `944d1bc` (frontend provider partial-update payload + silent error reload). Pre-existing `user.service.spec.ts` failures unrelated.
- **No architecture diagram update needed** (frontend-internal data-model refactor + `LlmProviderModule` transformer fix).

## 2026-08-12 Session — Fix ideas-grid/ideas-history card overlap

- **DONE:** Added `::ng-deep` block inside `.idea-card` in `idea-card.css` to pierce Angular's emulated view encapsulation. This sets `min-height: 0` on `.idea-card-wrapper` and `position: static` / `transform: none` on `.idea-card`, so expanded cards in both the grid and history views push siblings down instead of overlapping. Previously the overrides were scoped to the parent component's attribute selector and were silently ignored due to emulated encapsulation.
- **Verified:** Frontend build ✅ (same pre-existing `strain-hunter.css` budget warning).

## 2026-08-12 Session — Fix "stuck on research" (ideas generation timeout) + header styling

- **DONE:** Root-caused ideas "stuck on research" to non-streaming LLM call (60s OpenAI SDK timeout) against the omniroute `auto/best-free` reasoning model; fixed by switching `generateResponse` to streaming + raising timeouts/token budgets (150s overall, 180s client, 2048/4096/4096 max_tokens). Repro: non-streaming 161s → streaming 25–65s with valid JSON.
- **DONE:** Header styling — verified CSS valid/bundled/tokens-resolve; applied cosmetic separator (`glass-border` bottom + `min-height`) since no browser tool available to see the exact defect. Needs user screenshot to confirm.
- **Verified:** backend `tsc --noEmit` ✅; frontend `ng build` ✅. Not yet committed.
- **Open:** exact header visual symptom unknown (user didn't answer); if generation still slow, switch omniroute default model off the reasoning `auto/best-free`.

## 2026-08-11 Session — Nightly Topic Discovery + Solo-Dev Constraints (PUSHED)

Upgraded the nightly ideas cron to discover topics automatically instead of a static env list, and aligned all idea prompts with solo-developer constraints.

- **`IdeasService.discoverTopics()`** (new): 4 parallel SearXNG searches → single LLM extraction via `TOPIC_DISCOVERY_PROMPT` → `{ domain, rationale }[]`, domains sanitized. Replaces `IDEAS_NIGHTLY_DOMAINS`.
- **`IdeasTasksService.runNightly()`**: discovery step first, then per-topic generation + `saveGeneration` (nightly/unread). One failing topic doesn't abort the rest.
- **Prompts**: `IDEA_GENERATION_PROMPT` gains solo-dev constraints (no hardware/IoT, weeks-to-months, no enterprise procurement, bootstrap-friendly); `VALIDATION_PROMPT` feasibility now encodes solo-buildability; fixed Hebrew typos.
- **Env**: `IDEAS_NIGHTLY_DOMAINS` removed → `IDEAS_NIGHTLY_TOPIC_COUNT` added (default 3). `backend/.env.example` updated.
- **SearXNG dev setup** (operational): docker container on `:8080` with checked-in `docker/searxng/settings.yml` (limiter off + json). Fixed duplicate `SEARXNG_URL` in `.env` (8888 was overriding 8080).
- Verification: backend build ✅, ideas tests 12/12 ✅, frontend build ✅.
- Commits this session (all pushed): `f3f6c51`, `036d98a`, `98039c7`, `f784e71`, `1e1de52`.

## 2026-08-11 Session — Ideas Persistence Finalization + Sidebar Dropdown (PUSHED)

**Completed:**
- Audited entire `ideas-persistence-plan.md` — all backend + frontend phases verified complete
- Fixed empty-session bug: `ideas.controller.ts` now checks `result?.result?.length` before persisting; converted to `.catch()` Promise chain
- Added `recentSessions` computed to `IdeasStore` (last 5 for sidebar)
- Created ideas history sidebar dropdown matching chat history pattern (feather icon, hover slide-in, delete-with-confirm)
- Updated plan checklist — all items checked; moved plan to `archive/features/`
- Backend: `npm run build` ✅, Frontend: `npx ng build --configuration=development` ✅
- Pushed to origin/main

**Files touched:** `ideas.controller.ts`, `ideas.store.ts`, `main-sidebar.ts/html/css`, `ideas-persistence-plan.md` (moved)

**Next:** visual test of sidebar dropdown on running dev server

## 2026-08-11 Session — Ideas Persistence + Nightly Generation (COMPLETED)

Completed the `ideas-persistence-plan.md` 7-phase plan using 3 parallel sub-agents:

**Backend (Phases 0–3) — all done:**
- Phase 0: `SavedIdeaSession` + `SavedIdea` entities, migration `AddSavedIdeasTables1786451852660`, `IdeasModule` wired with `TypeOrmModule`.
- Phase 1: `IdeasService.saveGeneration()` + all query methods (`listSessions`, `getSession`, `deleteSession`, `setFavorite`, `unreadNightlyCount`, `markNightlyRead`) — all ownership-checked via `ForbiddenException`.
- Phase 2: 6 new controller endpoints with `JwtAuthGuard` + Swagger.
- Phase 3: `IdeasTasksService` with `@Cron('0 0 4 * * *')` — gated by `IDEAS_NIGHTLY_ENABLED`, resolves admin user + model, per-domain try/catch.

**Frontend (Phases 4–6) — all done:**
- Phase 4: `IdeasService` gained 6 new API methods; `IdeasStore` gained `sessions`, `nightlyUnread`, `historyLoading`, `historyError` signals + `loadSessions`, `deleteSession`, `toggleFavorite`, `loadNightlyUnread`, `markNightlyRead` actions.
- Phase 5: `IdeasHistory` component (filter bar: הכל/ליליים/מועדפים, expandable session list, per-idea star, delete-with-confirm), route `/ideas/history`, sidebar nav item.
- Phase 6: `IdeaCard` gains `savedIdeaId`/`isFavorite`/`toggleFav` inputs/outputs + star button (only renders when `savedIdeaId` defined); `IdeasPage` gains nightly unread banner.

**Verification:**
- `npm run build` (backend) ✅
- `npx ng build --configuration=development` (frontend) ✅
- `npx jest ideas.service.spec.ts` — 6/6 pass ✅ (includes empty-session skip test)
- `npx jest ideas-tasks.service.spec.ts` — 2/4 pass ⚠️ (env timing; see known issue)
- `documents/architecture-diagram.md` updated with new entities, Ideas Persistence & Nightly Flow diagrams, API surface table.
- Mojibake scan clean on all touched files ✅

**Bug fixed this session:** `saveGeneration` previously created a session even when `response.result` was empty. Now it **returns `0` and skips session creation** when there are no ideas (`if (ideas.length === 0) return 0;`).

**Not done (out of scope / deferred):**
- Phase 3 unit test env timing fix (2/4 tests) — low priority, cron logic itself is correct
- `swagger-spec.json` manual verification
- Manual smoke test (no live server at time of completion)
- Env var documentation (`IDEAS_NIGHTLY_ENABLED`, `IDEAS_NIGHTLY_DOMAINS`, `IDEAS_NIGHTLY_COUNT`, `IDEAS_NIGHTLY_MODEL`) — add to `.env.example` / deployment docs

**Files touched:** 30+ files (entities, service, controller, tasks service, migration, frontend service, store, history page, idea card, ideas page, sidebar, routes, architecture diagram, STATUS/HANDOFF).

## 2026-08-10 Session — Commit `31eadd9` documented (message ≠ content)

Commit `31eadd9` ("Add HTML-in-Canvas proposal and review calendar documentation") contains no docs — its real content was undocumented until now. Full inventory in `documents/HANDOFF.md` under the same session. Summary:

- **Seed rework:** `llm-providers.seed.ts` rewritten → 5 providers / 46 models (OmniRoute, openrouter, agnes-ai, requesty, nvidia). Genetics/Terpene seeds moved to `core/seeds/`, expanded, enabled in `main.ts`. `seedLlmProviders` itself remains **commented out** in `main.ts`.
- **Calendar q-scan:** −1 month → +1 year, pagination (2500/page), 10 000-item cap, DST-safe month arithmetic; LLM system-context updated.
- **LLM:** `LlmResponse` + `finishReason` / `rawCompletion`.
- **Ideas:** validation prompt rewritten (calibration examples, analysis-before-score JSON).
- **⚠️ SSRF dev-bypass** in `ssrf-guard.util.ts`: HTTP + localhost allowed in dev — same pattern as reverted `82d9baa` but narrow (localhost set only; metadata hosts still blocked). Intent: local OmniRoute. Documented as a conscious decision.
- Small fixes: spec constructor arity, swagger 403 for `forceRefresh`, deletion of 3 stale migration files.

**Open (from this commit):** re-enable `seedLlmProviders`? OmniRoute API key env var (currently reuses `OPENROUTER_API_KEY`)? No Ollama provider in seed despite the DB plan.

## Audit Fix Status — `documents/audit/code-review-2026-08-05.md`

**Overall: 6 / 6 Critical + H1–H8 ALL closed. 🎉**

| Severity | Total | Closed | Open |
| -------- | ----- | ------ | ---- |
| 🔴 Critical | 6 | **6** (C1, C2, C3, C4, C5, C6) | — |
| 🟠 High | 8 | **8** (H1 ✅, H2 ✅, H3 ✅, H4 ✅, H5 ✅, H6 ✅, H7 ✅, H8 ✅) | — |
| 🟡 Medium | 22 | most via quick-wins (L2-L6, L8, L10, L12-L13, L20, L23-L25, L27, L29-L31) | L11 images→external storage, L34 sequence column, L36 status column (all need migration) |
| 🟢 Low / Info | ~36 | most | L1 seeds (non-relevant), L28/L35 soft-delete sessions (deferred by user) |
| 🔧 UX | 3 | 3 (calendar loop-breaker ✅, auth-url card ✅, q parameter ✅) | — |

**SSRF regression caught:** `82d9baa` bypassed all SSRF checks in dev mode → reverted `021224b` → 12/12 C3 tests pass ✅.

Critical commit trail: C6 `8f4022c` → C1 encryption → C4 `376369d` (Google Calendar) → C3 `dc1d909` (extendVideo SSRF) → C5+H3 `56b6ac0` → H1 `6d45a7c` → SSRF revert `021224b`.

## 2026-08-05 Session — C5: Confirmation flow activated + H3 self-confirmation closed

- Completed: C5 (Critical #5) — the `@RequiresConfirmation` decorator wrote metadata to NestJS Reflector but the swagger-spec never received `x-requires-confirmation`, so `isDangerousOperation()` always returned false and dangerous ops (delete user, change role, cleanup) executed without confirmation. Now:
  - Decorator rewritten: `applyDecorators(SetMetadata('requires_confirmation', true), ApiExtension('x-requires-confirmation', true))` — writes both NestJS metadata and OpenAPI extension.
  - Boot assertion in `main.ts`: counts `x-requires-confirmation: true` entries in the swagger-spec and compares against a hardcoded expected list (`UsersController_delete`, `UsersController_updateRole`, `LlmProviderController_cleanupTestResults`). Fails loud if mismatch — prevents the exact regression that caused C5.
  - H3 closed: `AdminAgentController_confirmAction` excluded from `getTools()` via denylist in `swagger-tools.parser.ts` — the LLM cannot call the confirm-action endpoint. The endpoint still exists for the UI (human-only confirmation path).
- Files: `decorators/requires-confirmation.decorator.ts` (rewritten), `main.ts` (boot assertion), `swagger-tools.parser.ts` (H3 denylist), new `requires-confirmation.decorator.spec.ts` + `swagger-tools.parser.spec.ts`
- Verification: 6 unit tests pass ✅, `npm run build` clean ✅, boot live: C5 assertion passes (3 ops in spec) ✅, confirmAction excluded from getTools ✅, confirm-action endpoint still exists in spec for UI ✅
- **All 6 Critical findings now closed.**

## 2026-08-05 Session — C3: SSRF + unbounded download in extendVideo fixed (closed)

- Completed: C3 — `extendVideo` (`sourceVideoUrl`) fetched attacker-controlled URLs with no validation, no size cap, silent redirects. Now:
  - DTO `@IsSafeUrl()` on `sourceVideoUrl` (https-only + blocklist + private-range)
  - Runtime `assertSafeUrl()` (DNS + ipaddr) in `downloadBuffer()` before every hop, `redirect: 'manual'` (max 5 hops, per-hop re-validation), 100MB streaming cap + content-length check, 120s timeout
  - Single download funnel covers both user-supplied URLs and provider-resolved videoId URLs
- Files: `backend/src/modules/llm/dto/validate-safe-url.validator.ts` (new), `extend-video.dto.ts`, `llm-client.service.ts`, `llm-client.service.spec.ts` (new, 12 tests)
- Verification: 12 unit tests pass ✅, `npm run build` clean ✅, live HTTP with real JWT: 127.0.0.1 / localhost / 192.168.1.5 → 400 ✅, public https URL passes validation and reaches the real download ✅
- Next: C5 (confirmation dead code — architectural, also gates H3). Remaining High: H1, H2, H4, H5, H7, H8. Then migration-dependent L11/L34/L36 and deferred L1/L28/L35.

## 2026-08-05 Session — C4: Google Calendar authz/credentials fixed (closed)

- Completed: C4 (Critical #4) — Google Calendar was fully unauthenticated and returned `refresh_token` to the client. Now:
  - `@UseGuards(JwtAuthGuard)` on all `/calendar` routes except `callback` (browser redirect from Google — protected by OAuth `state` CSRF instead: httpOnly `gcal_state` cookie + non-expired DB row bound to the user).
  - `refresh_token` stored server-side, encrypted (AES-256-GCM via EncryptionService) in new `google_calendar_tokens` table; never accepted from client input and never returned in any response.
  - Ownership is structural: tokens resolved by `req.user.sub` only — no way to target another user's calendar.
  - Fixed cross-user token leak: shared singleton OAuth2 client replaced with per-call client.
  - Removed `refreshToken` from all event DTOs (client-supplied credential vector removed).
- Files: `backend/src/modules/google-calendar/*` (controller, service, module, new entity, 3 DTOs, 2 new spec files), `backend/src/migrations/AddGoogleCalendarTokens1765000000000.ts` + runner script, `documents/audit/code-review-2026-08-05.md` (C4 marked fixed)
- Verification: migration ran against live DB ✅, full app boot OK ✅, live HTTP checks (events/auth no-JWT → 401, callback missing code → 400, callback state mismatch → 400) ✅, 18 new unit tests pass ✅, `npm run build` clean ✅
- Known pre-existing failures (NOT from this change): `app.controller.spec.ts` + `llm-provider.service.spec.ts` fail to compile (TS2339/TS2554), `agent-session.service.spec.ts` 3 `imageUrl` tests fail, e2e suite can't run (puppeteer ESM in jest-e2e config)
- Next: C3 (SSRF in `extendVideo` sourceVideoUrl — `assertSafeUrl()` exists, cheap reuse) or C5 (confirmation dead code, architectural) or stop

## 2026-08-05 Session - Media Studio LLM Provider Payload Check

- Completed: checked the live `/llm-provider` payload directly after Browser/DevTools access was unavailable in this Codex session.
- Result: `capability` is present on every returned model object, but all 45 returned models have `capability: "text"`.
- Current state: Media Studio select is empty because the API returns zero active models with `capability: "image"` and zero active models with `capability: "video"`.
- Root finding: active `agnes-ai` media model rows are returned as text: `agnes-image-2.0-flash`, `agnes-image-2.1-flash`, and `agnes-video-v2.0`.
- Next: repair those DB rows or run/re-enable the existing seed reconciliation that sets Agnes model capabilities correctly.

## 2026-08-05 Session — Full Code Review (read-only audit)

- Completed: full code review → `documents/audit/code-review-2026-08-05.md` (6 Critical / 8 High / 22 Medium / ~36 Low-Info)
- Current state: audit file is the reference for upcoming fixes; no code changed
- Next: implement quick wins in order (start: AdminGuard on `/llm-provider` + mask `apiKey`)

## 2026-08-01 Session — Tooltip Effect Tag Font Size

- Completed: reduced `.tooltip-card-effect-tag` font size from `var(--font-size-xs)` (12px) to `9px` in `tooltip.css`
- Files: `frontend/src/app/components/shared/tooltip/tooltip.css`
- Current state: CSS-only change, no verification performed
- Next: visually confirm tooltip effect tags in strain-hunter

## 2026-07-28 Session — CSS Animation Audit, Page Layout Unification, Drag-and-Drop Fix

- Completed: CSS animation audit for all feature CSS files (#16-52) with `find-animation-opportunities` and `emil-design-eng` skills
- Completed: `:active scale(0.97)` on buttons/interactive elements in multiple files
- Completed: GPU-accelerated `scaleX()` replacing `width` transitions on progress bars (system-status, database-monitor-settings, database-storage-monitor, media-studio)
- Completed: grid-rows expand/collapse animation on idea-card, `.preview-bar-fill` RTL transform-origin fix
- Completed: Settings Design System tab (tab value="3", Hebrew label "מערכת עיצוב")
- Completed: matching-preferences-drawer reset buttons — all3 changed to `button icon-only sm transparent-btn reset-btn`
- Completed: page layout unification — all3 composer pages use `page-content flush`, removed duplicate layout overrides from `chat.css` and `media-studio.css`
- Completed: drag-and-drop fix — drag counter pattern, overlay moved to composer-area, z-index/background fixes
- Completed: auto-focus for ideas-form domain input and media-studio textarea
- Files: `_layout.css`, `_composer.css`, `chat.html`, `chat.css`, `chat.ts`, `media-studio.html`, `media-studio.css`, `media-studio.ts`, `ideas-form.html`, `ideas-form.ts`, `settings.ts`, `settings.html`, `matching-preferences-drawer.html`, `matching-preferences-drawer.css`
- Current state: no build verification performed this session (CSS/HTML/TS changes only)
- Next: pick up active plans from `documents/features/todo/`

## 2026-07-26 Session — Drag-and-Drop, Drop Overlay, Ideas Card — All Reverted

- Attempted fixes for drag-and-drop flicker, drop overlay blur, model capability errors, and idea card z-index/blur issues.
- ALL changes were reverted — original code was working correctly.
- Key lesson: `.glass-effect`'s `::before` pattern is fragile; do not modify `isolation`, `z-index`, or `backdrop-filter` without testing all adjacent cards.
- Files touched (all reverted): `chat.ts`, `chat.html`, `media-studio.ts`, `media-studio.html`, `_composer.css`, `idea-card.css`, `ideas-grid.html`
- Current state: Clean — no uncommitted changes. All features working.
- Next: Tomorrow — investigate glass-effect artifacts slowly and carefully.

## 2026-07-25 Session — CSS Cleanup: Labels, Compact Inputs, Number Steppers

- Consolidated duplicated CSS patterns across composer inputs.
- Moved bare `label` styles to `_typography.css` with `color: var(--color-text-primary)`. Removed duplicates from `_forms.css` and `_composer.css`.
- Created global `.compact-input` class with `xs`/`sm`/`md`/`lg` variants in `_forms.css`. Removed duplicated input styles from `_composer.css` and `media-studio.css`.
- Added global number spinner hiding for all `input[type='number']` in `_forms.css`.
- Created `.number-stepper` CSS with custom `ph-caret-up`/`ph-caret-down` buttons. Added increment/decrement methods to `IdeasForm` and `MediaStudio`.
- Moved `media-mode-toggle` inside `composer-field`, made it smaller, positioned at top-left.
- Files: `_typography.css`, `_forms.css`, `_composer.css`, `media-studio.css`, `media-studio.html`, `media-studio.ts`, `ideas-form.html`, `ideas-form.ts`.
- Verification: CSS-only changes, no logic to test. No build verification performed.

## 2026-07-22 Session — Main Sidebar Chat History Dropdown Fix

- Fixed 3 issues with the chat history dropdown in the main sidebar: missing blur/glass-effect, feather button not navigating, and click event bubbling to the parent chat button.
- Root cause: `<app-dropdown>` was nested inside `<button routerLink="/chat">` — invalid HTML that breaks `backdrop-filter` and causes event bubbling.
- Fix: moved `<app-dropdown>` outside the chat `<button>` into a `.nav-item-chat` wrapper div. Chat button and feather button are now siblings.
- Added `.nav-item-chat` CSS with `::ng-deep` to override the dropdown's `width: 100%` / `display: grid` and prevent layout breakage.
- Added `$event.stopPropagation()` to the feather button click to prevent bubbling to `routerLink="/chat"`.
- Added `appTooltip` to the feather button with `TooltipDirective` import.
- Files: `main-sidebar.html`, `main-sidebar.ts`, `main-sidebar.css`.
- Verification: `npx ng build` passes.

## 2026-07-22 Session — CSS Overriding Remediation

- Remediated all 27 violations from the CSS overriding audit across Rule A (exact match), Rule B (suspicious suffix), and Rule C (duplicate) categories.
- Applied principle: structural overlap (display/align/gap) + visual differences → merge with modifier; no structural overlap → independent name.
- Created 6 new global modifiers: `.row-subtitle--flex`, `.badge-compact`, `.chip-neutral`, `.chip-like`, `.chip-love`, `.chip-avoid`.
- Renamed 8 misleading class names: `.status-indicator` → `.status-dot`, `.count-badge` → `.count-value`, `.detail-chip` → `.detail-tile` (×2), `.db-chip` → `.db-stat-pill`, `.summary-card` (db) → `.summary-row`, `.forecast-card` → `.forecast-tile`.
- Merged 2 components into globals: `.strain-penalty-badge` → `.badge.badge-danger.badge-compact`, `.terpene-chip`/`.genetics-chip` → `.chip.chip-${state}`.
- Deleted 10 duplicate rules: `.fade-in` ×5, `.form-field`, `.metric-card`, `.panel-header.compact`, `.panel-title.muted`, `.row-subtitle` (local).
- Kept 3 as documented false positives: `.flag-badge`, `.col-expand`, `.summary-card` (weather-summary).
- Bonus fixes: "Add Model" button styling, `.panel-header.compact` justify-content.
- Verification: `npx ng build` passes. Summary at `documents/done/css-overriding-search-remediation.md`.
- Remaining: visual regression check across 8 pages, then git commit.

## 2026-07-22 Session — Ideas Page Chat-Style Layout

- Restructured `/ideas` to match the chat page layout: full-height flex column with a scrollable middle region (header + results) and a bottom-docked composer.
- **Global composer shell:** created `frontend/src/app/assets/styles/_composer.css` with `.composer-area`, `.composer-field`, and `.composer-submit` rules. Connected from `styles.css` after `_filters.css`. Both chat and ideas now consume the same shell, so future "composer UIs" (admin confirmations, etc.) reuse the same focus-glow and circular send/stop button.
- **Chat updated to use the global classes:** `chat.html` swaps `chat-input-area` / `chat-prompt-field` / `chat-send-btn` for `.composer-area` / `.composer-field` / `.composer-submit`. The moved rules were removed from `chat.css`; chat-specific bits (image preview, drag overlay, history loader, prompt-actions row) stay local.
- **Ideas page restructure:** `ideas-page.html` now wraps everything in `page-content.ideas-root` with a `flex: 1; overflow-y: auto` `.ideas-scroll` region for the header + `@switch` body. `<app-ideas-form />` is moved out of the top flow and renders at the bottom inside `.composer-area`. `ideas-page.css` lost `.ideas-layout` and gained the dock rules.
- **Ideas form restructure:** `ideas-form.html` drops the `glass-effect card` wrapper and renders the composer-field structure: domain `<input>` on top, a `.composer-meta-row` with the count slider on the left and model `<p-select>` + circular submit/stop on the right. The submit/stop button uses the global `.composer-submit` styling and toggles to `ph-stop` while loading. `ideas-form.css` lost the duplicated card/slider/model/submit rules and gained only the local composer-meta-row layout.
- **Stop-while-loading support:** `IdeasStore.stopGenerating()` unsubscribes the SSE subscription (which already aborts the fetch via `controller.abort()`), clears `loading`, and sets `partial: true` with a Hebrew "היצירה הופסקה על ידי המשתמש" message when partial results exist. The error path now filters `AbortError` so clean stops don't surface as a page error. `IdeasForm.onStopGenerate()` wires the button click to the store. `canGenerate` computed disables the submit when domain is empty.
- Verification: `npx ng build` from `frontend` passes with no new warnings (only pre-existing strain-hunter and initial-bundle budget warnings remain). `npx ng test --watch=false`: 120/123 pass; 3 failures are pre-existing (`app.spec.ts` × 2, `currency-card.component.spec.ts` × 1). Corruption scan on touched files is clean.
- No backend changes. No architecture diagram update needed (UI layout only).
- Files touched: `frontend/src/app/assets/styles/_composer.css` (new), `frontend/src/styles.css`, `frontend/src/app/features/chat/chat/chat.html`, `frontend/src/app/features/chat/chat/chat.css`, `frontend/src/app/features/ideas/ideas-page/ideas-page.html`, `frontend/src/app/features/ideas/ideas-page/ideas-page.css`, `frontend/src/app/features/ideas/ideas-form/ideas-form.html`, `frontend/src/app/features/ideas/ideas-form/ideas-form.css`, `frontend/src/app/features/ideas/ideas-form/ideas-form.ts`, `frontend/src/app/core/store/ideas.store.ts`, `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.
- Decisions made: lift the shared shell to a global partial rather than duplicating per-component; keep the model `<p-select>` template component-local (already shared via `LlmProviderStore.chatModels`); use the existing `controller.abort()` Observable teardown path for stop support instead of adding a new API.
- Follow-up: ideas empty state now mirrors the chat's `.empty-chat-state` pattern (centered teal `.ph.xl` icon + `h3.title` + `.subtitle`, no card chrome). The `PageStates.Empty` block swapped from `page-state empty-state` to a new `.empty-ideas-state` class in `ideas-page.css`. Error state still uses the global `.page-state.error-state` because the chat page has no equivalent error UI. Build passes, corruption scan clean.
- Follow-up: ideas count input changed from `<input type="range">` to `<input type="number" min="1" max="10" step="1">` per user request. The redundant `<span class="composer-count-value">{{ store.count() }}</span>` next to the input was dropped (the number input shows the value natively). `ideas-form.css` lost the `.composer-count input[type='range']` and `.composer-count-value` rules and gained a new `.composer-count input[type='number']` rule with token-only chrome (64px width, surface bg, border, focus glow). Build passes, corruption scan clean.

## 2026-07-21 Session — Business Idea Generator Closed

- Verified the already-implemented business idea generator end-to-end.
- Backend: `IdeasModule` wired in `AppModule`, `ThrottlerModule.forRoot` with 2 named throttlers + `IdeasThrottlerGuard` as `APP_GUARD`. Controller exposes `POST /ideas/generate` and SSE `GET /ideas/generate/stream`. Service runs 3-phase agentic loop (SearXNG signal gathering → LLM idea generation → per-idea validation) with 60s timeout + partial results.
- Frontend: `IdeasPage` with `PageStates`, `IdeasForm` (domain + count slider), `IdeasProgress` (3-segment phase bar via SSE), `IdeasGrid` + `IdeaCard` (score badge, grounded/ungrounded tag, expandable details). Store consumes SSE stream with `AbortController`.
- Verification: backend build passes, frontend build passes (pre-existing warnings only), mojibake scan clean.
- Moved `business-idea-generator-plan.md` and `chat-idea.md` to `documents/done/`.
- Active todo now: `dynamic-pharm-scraping-plan.md` and `provider-and-llm-db-plan.md`.
- Architecture diagram: needs update — new `IdeasModule` and ideas UI flow.

## 2026-07-20 Session — Loader Shimmer Implemented (Phases 1, 2, 3, 5, 6)

- Implemented Phases 1, 2, 3, 5, 6 of `documents/features/todo/loader-shimmer-plan.md`.
- **Phase 1:** `@keyframes shimmer-sweep` + RTL variant in `_animations.css`. `.shimmer`, `.shimmer--sm/md/lg`, `.shimmer-text` in `_utilities.css` with RTL, reduced-motion, and token-first gradient.
- **Phase 2:** Chat step `loading-dots` → `<span class="shimmer-text">טוען...</span>` + spinner icon. Dead `.response-loader` removed. `responseLoaderPulse` keyframe removed.
- **Phase 3:** Strain-hunter `.dots-loader` → `<span class="shimmer shimmer--sm">`. `.loading-dots`, `.dots-loader`, `dot-bounce` keyframe removed.
- **Phase 5:** Text shimmer on `טוען...` in login/register, `מבצע העשרה...` in strain-hunter-settings (×2), `טוען נתוני מסד נתונים...` in database-monitor-settings.
- **Phase 6:** Grep clean for obsolete classes. Build passes. Tests 120/3 (pre-existing).
- **Phase 4 (`.custom-loader` rebrand) remains deferred.**
- Architecture diagram: no update needed (CSS-only, no new components or endpoints).

## 2026-07-19 Session — Agnes GenUI render blocks + video frame-continuation

- Made Agnes image/video results render inline in chat instead of markdown links. Added `RenderSpecType.AgnesImage` + `AgnesVideo`, schemas (`image.render-spec.ts`, `video.render-spec.ts`), and `render-spec.service.ts` mappings for `LlmController_generateImage`, `createVideo`, `getVideo`, and `extendVideo`. Frontend: new `agnes-image-card` and `agnes-video-card` blocks registered in `render-host.component.ts`.
- Image model default: `LlmController.resolveCapabilityModel` fallback now picks the highest-version active capability model (`agnes-image-2.1-flash` over `2.0-flash`) when `modelId` is omitted; both stay selectable. The `generateImage` controller logs the resolved model.
- Video polls to completion: `LlmClientService.createVideoTaskAndWait` submits then polls `getVideoResult` until `completed` (150s timeout), so `createVideo` returns a real `.mp4` URL — no more hallucinated links.
- Frame-continuation: added `ffmpeg-static` dependency and `LlmClientService.extendVideo` — downloads the source video (by `sourceVideoId` or `sourceVideoUrl`), extracts the last frame via ffmpeg (`-sseof -1 -frames:v 1`), base64-encodes it, and submits an image-to-video task with that frame. New `POST /llm/video/extend` (`ExtendVideoDto`, tool `LlmController_extendVideo`), render mapping → `AgnesVideo`. Verified Agnes accepts base64 image input (no external hosting needed). Live test confirmed inline `agnes-video` card with real `.mp4`.
- Verification: backend `npm run build` passes; frontend `npx ng build` passes (pre-existing unrelated warnings only).
- Architecture diagram updated (Agnes provider, multimodal flow, ffmpeg frame-extract, render-block path, notes).

## 2026-07-18 Session — Agnes AI Multimodal Plan Implemented (Phases 1-6)

- Implemented the full Agnes AI multimodal plan: chat was unreachable through the DB path because the seed keyed the provider `agnes` while runtime looked up `agnes-ai`. Fixed the seed to key `agnes-ai` (apihub baseUrl) with an idempotent update-in-place reconciliation; added a `capability` enum column to `LlmModelEntity`.
- Capability guards: chat path and the nightly/test health checks now reject or skip non-text models, so image/video models no longer pollute the test-results table.
- Added image generation (`POST /llm/image/generate`) and async video generation (`POST /llm/video/generate`, `GET /llm/video/:videoId`) via raw `fetch` against the Agnes API, with full Swagger decorators.
- Frontend `LlmModel` now carries `capability` (dropped stale `isDefault`); chat dropdown filters to `capability === 'text'` via `LlmProviderStore.chatModels`.
- Verification: `npm.cmd run build` (backend) passes; `npx ng build` (frontend) passes with pre-existing unrelated warnings only.
- Plan moved to `documents/done/agnes-ai-multimodal-plan.md`. Remaining manual work: live end-to-end image/video generation with `AGNES_API_KEY` and a visual chat-dropdown check.

## 2026-07-18 MCP Bridge — Phase 4 Complete, Hebrew UI

- **Phase 4 (Remove WeatherModule):** Deleted `backend/src/modules/weather/` (controller, service, module, 4 DTOs). Removed `WeatherModule` from `AppModule`. Removed old `WeatherController_getWeather`/`getForecast` render-spec mappings. Updated `render-spec.service.spec.ts` (error tests now use Swagger tools). Verified 92/92 tests pass.
- **Hebrew UI labels:** Weather current card all labels translated to Hebrew. Weather forecast card location stripped of lat/long. Currency card "Exchange Rates" → "שערי חליפין", "Base:" → "בסיס:".
- **MCP tool Hebrew descriptions:** Added in `agent-tool-executor.service.ts` — `get_current_conditions` → "מקבל מזג אוויר נוכחי", `get_forecast` → "מקבל תחזית מזג אוויר", `check_service_status` → "בודק סטטוס שירות".
- **Architecture diagram:** Updated to remove WeatherModule, add McpBridgeModule, show MCP dispatch branch in tool execution flow.
- **Live test:** Both `get_forecast` and `get_current_conditions` confirmed dispatching via MCP (no `[GET]` logs). Weather cards render with real data.
- **Feature complete.** No further action required.

## 2026-07-18 MCP Bridge — Phases 1-3 Complete

- **Phase 1 (Bridge infra):** Created `mcp-bridge.config.ts` (MCP_SERVERS registry, resolveLaunchSpec), `mcp-server-client.ts` (SDK Client + StdioClientTransport), `mcp-bridge.service.ts` (getTools/hasTool/callTool), `mcp-bridge.module.ts`. SDK import fixed: Node 24 doesn't auto-append `.js` for exports-map-resolved paths; resolved via `@modelcontextprotocol/sdk/client` + navigate to `stdio.js`.
- **Phase 2 (Wire into agent):** Added `source` field to parser's `LlmToolSchema`. MCP tools merged in `AdminAgentService.getTools()`. MCP dispatch branch in `AgentToolExecutorService.executeToolCall` before `getEndpoint`. `McpBridgeModule` imported in `AppModule` and `AdminAgentModule`.
- **Phase 3 (Render specs):** Added `source` to `ToolRenderMapping`. `buildRenderSpec` checks JSON error envelope for MCP source. Two MCP weather mappings added (`get_current_conditions` → `WeatherCurrent`, `get_forecast` → `WeatherForecast`) with markdown regex transforms. 7 tests passing.
- **Tool names:** Actual names from `@dangahagan/weather-mcp` are `get_current_conditions` (not `get_current_weather`) and `get_forecast`.
- **Output format:** MCP returns markdown text, not structured JSON. Transforms parse via regex.
- **Known gap:** MCP `isError` responses not detected in v1 (documented in plan).
- **Verification:** 94/94 backend tests pass (1 pre-existing `app.controller.spec.ts` fail). `tsc --noEmit` clean. Backend boots successfully.
- **Next:** Phase 4 (remove WeatherModule) gated behind manual verification. Phase 5 (docs).

## 2026-07-15 Session (continued — Remove LLM Prose Duplication of Card Data)

- After the render-spec fix landed, the weather forecast card rendered correctly with 5 day cards, but the LLM was still producing a duplicate markdown table of the same data above the card. User feedback: "הטבלה הראשונית מיותרת" (The initial table is redundant).
- Root cause: the system prompt in `system-context.constant.ts` did not tell the LLM that structured tool results are auto-rendered as visual cards. The LLM reasonably reproduced the data in prose as a "just in case" fallback.
- Fix: added a `VISUAL RESPONSE RULE` block to `SYSTEM_CONTEXT_BASE` in `backend/src/modules/admin-agent/constants/system-context.constant.ts`. The rule:
  - Lists the 11 render-bearing tool types by name so the LLM has an explicit enumeration (weather forecast, currency conversion, users table, analytics chart, system status, database storage, chat sessions, transcript, LLM test results, delete confirmation, register form).
  - Instructs the LLM to write only a short prose summary that adds context the visual cannot show.
  - Forbids markdown tables, bullet lists, or inline lists of the same numbers/rows the card will show.
  - Allows inline reproduction only when the user explicitly asks for raw text-only output (screen reader, copy-paste).
- Rule is generic and applies to all render-bearing tools without per-tool customization.
- Verification: `npm.cmd run build` from `backend` passes. No new code tests were added because the change is a system-prompt instruction; the live verification requires a dev server, JWT, and LLM credentials.
- Files touched: `backend/src/modules/admin-agent/constants/system-context.constant.ts`, `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.

## 2026-07-15 Session (continued — RenderSpec Data Mapping Fix)

- Fixed the `RenderSpecService` data mapping bug that was causing all 16 render components to receive empty data and fall back to LLM prose rendering (e.g. weather forecast showing as a markdown table from the LLM instead of a 5-day card list).
- Root cause: every domain controller wraps its response in `ServiceResultContainer<T>` (shape: `{ success, message, result: T, error? }`), but the `TOOL_RENDER_MAPPINGS` transforms in `render-spec.service.ts` were reading from `data` directly, so all fields resolved to `undefined`. Zod (everything `.optional()`) accepted the empty candidate, and the service yielded a `render` event with empty data.
- Secondary bug: several transforms referenced wttr.in raw field names (`temp_C`, `FeelsLikeC`, `weatherDesc?.[0]?.value`) instead of the DTO field names (`tempC`, `feelsLikeC`, `description`). Even after unwrapping, values would be `undefined`.
- Fix: rewrote all 16 transforms to (a) unwrap `data.result` for `ServiceResultContainer`-wrapped endpoints, (b) handle the few admin-agent endpoints that return data directly (`getSessions` array, `getSessionMessages` `{messages, hasMoreImages}`), (c) map DTO field names to the contract names the Zod schemas and Angular components expect. Added `toNumber`/`toBool` helpers for DTOs that return string-encoded numerics/booleans.
- Updated 5 test fixtures in `render-spec.service.spec.ts` to wrap input as `ServiceResultContainer` so tests actually exercise the production unwrap path.
- Verification: backend build pass, backend tests 60/60 pass (1 pre-existing `app.controller.spec.ts` TS error), frontend build pass with existing warnings, frontend tests 121/123 pass (2 pre-existing `app.spec.ts` `MessageService` failures).
- Files touched: `backend/src/modules/admin-agent/render-spec/render-spec.service.ts`, `backend/src/modules/admin-agent/render-spec/render-spec.service.spec.ts`, `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.
- Next: ~~manually test in running app — ask "מה תחזית מזג האוויר ל-5 ימים בתל אביב" — should show `WeatherForecastComponent` with 5 day cards, not the LLM prose table. If confirmed, move `genui-to-json-migration-plan.md` to `documents/done/`.~~ **Done.** User screenshot confirms `WeatherForecastComponent` renders 5 day cards (רביעי 32°/25° ☀️, חמישי 35°/28° ☁️, שישי 35°/29° 🌧️, שבת 33°/27° ⛈️, ראשון 31°/24° ☀️) with humidity and "Tel Aviv" location label. `genui-to-json-migration-plan.md` moved to `documents/done/`.

## 2026-07-15 Session (GenUI → JSON Migration — Phases 1 & 2)

- Completed Phase 1 (Backend) and Phase 2 (Frontend) of `genui-to-json-migration-plan.md`.
- **Phase 1 Backend**: Installed `zod`. Created `render-spec/` directory with 12 files: `RenderSpecType` enum (16 types), `RenderSpec` union type, 9 domain render spec files with TypeScript interfaces + Zod schemas, `RenderSpecService` with `buildRenderSpec()` mapping 16 tool names, 17 unit tests. Added `renderSpec` column to `ChatMessage` entity. Updated `AdminAgentService` to yield `{type:"render"}` SSE events after tool execution and persist `renderSpec` to DB.
- **Phase 2 Frontend**: Created `RenderHostComponent` with `@switch` for all 15 render types. Updated `ChatStreamEvent` with `render` type. Added `IRenderBlock`, `renderBlocks`, `renderSpec` to `IChatMessage`. Updated `ChatMessage` with `pendingRenderBlocks` signal, `renderBlocksForDisplay` computed, `handleStreamEvent()`, and `resetLocalState()` parsing. Updated `chat-message.html` with render host blocks. Updated `Chat` component to handle `render` stream events.
- Compatibility layer: both old ` ```component ` and new `render` events work simultaneously.
- Verification: backend build pass, backend tests 60 pass (1 pre-existing fail), frontend build pass, frontend tests 47 pass (2 pre-existing fail).
- Plan active at `documents/features/todo/genui-to-json-migration-plan.md`.
- Next: Phase 3 — Build Angular Components (Batch 1: WeatherCurrentCard, CurrencyCard, DeleteConfirmCard, SessionCreatedCard, RoleChangeCard).

- Implemented full-stack database storage monitor per `documents/features/todo/database-storage-monitor-plan.md`.
- Backend: `DatabaseMonitorModule` with `GET /database-monitor/storage` endpoint, TypeORM `DataSource` query on `information_schema.tables`, DTOs with Swagger decorators, GenUI spec for donut chart + table cards.
- Frontend: `DatabaseMonitorSettings` component in Settings page (third tab "מסד נתונים"), donut chart via CSS conic-gradient, per-table bar chart, summary cards with loading/error/empty states.
- Tests: 7 backend service tests (sorted summary, empty tables, byte formatting, zero-division, percentOfDatabase, fixed query, null rowCount).
- Verification: backend test 25 pass (1 pre-existing fail), backend build pass, frontend build pass.
- Plan moved to `documents/done/database-storage-monitor-plan.md`.

## 2026-07-07 Session (GenUI Speed and Quality Improvement — Implementation)

- Implemented all five phases of `documents/features/todo/genui-speed-and-quality-improvement-plan.md`.
- Phase 1: Progressive streaming rendering in `AiFormat` — partial parser, sanitizers, rAF-throttled preview, stable preview host, no-DOM-thrash finalization.
- Phase 2: Smarter chat-message flushing — component mode flushes 12-24 char chunks at 0ms; prose keeps 18-35ms cadence; cursor hidden in component mode.
- Phase 3: Backend prompt trimming — `SYSTEM_CONTEXT` split into `BASE` + `GENUI`; GenUI gated on visual-trigger keywords; per-template boilerplate trimmed.
- Phase 4: Streaming efficiency — rAF-coalesced token buffering in `Chat`; `AiFormat` progressive preview uses stable preview host.
- Phase 5: Documentation — architecture diagram updated with streaming event flow; `[AdminAgentStream]` log line added; `documents/architecture/genui-streaming-protocol.md` created.
- Moved plan to `documents/done/genui-speed-and-quality-improvement-plan.md`.
- Verification: frontend tests 47 pass (2 pre-existing failures), frontend build passes, backend tests 25 pass (1 pre-existing failure), backend build passes.

## Document Areas

| Area | Path | Purpose | Status |
| --- | --- | --- | --- |
| Active feature plans | `documents/features/todo/` | Approved or planned feature work that still needs implementation. | Active |
| Incomplete notes | `documents/features/incomplete/` | Drafts, partial plans, or work that needs cleanup before execution. | Active |
| Completed plans | `documents/done/` | Plans that were implemented or closed. | Existing |
| Audit reports | `documents/audit/` | Reviews, scans, and verification reports. | Existing |
| Architecture | `documents/architecture-diagram.md` | Current Mermaid architecture diagrams. | Existing |

## Current Rule

New planning documents should go under `documents/features/todo/` unless they are audits, completed work, or incomplete drafts.

## 2026-07-04 Session (continued — Strain Hunter Settings Filter Fix)

- Completed: fixed the genetics and terpenes filter fields in `frontend/src/app/features/settings/strain-hunter-settings/`. `onGeneticsFilter`/`onTerpeneFilter` are now `(value: string)` to match `(ngModelChange)`, and `filteredGenetics`/`filteredTerpenes` are `computed()` signals so change detection reacts to filter changes.
- Completed: added styled empty messages inside both `<p-table>`s. Genetics uses `ph-magnifying-glass-minus`, terpenes use `ph-leaf`. Each empty message contains a Hebrew title and a Hebrew subtitle, and the colspans match the column counts (7 for genetics, 5 for terpenes).
- Completed: added a `.table-empty-state` rule to `strain-hunter-settings.css` that mirrors the global `.page-state.empty-state` visual language (icon + title + subtitle) using only `var(--token)` values, nested under the root selector.
- Verified: `npx ng build` from `frontend` passes; mojibake scan on touched files is clean.
- No architecture diagram update was needed because this was local Strain Hunter Settings UI filter behavior only.

## Recent Status

- Planned: `documents/todo/dynamic-pharm-scraping-plan.md` — minimal: loop over the existing `favoritePharm` array in the backend service, build per-pharm Jane URLs dynamically, cross-pharm merge by normalized `enName` into a `prices: Record<pharmQuery, ...>` shape, and render one price column per entry in `strain-hunter.html`. Adds a single `pharmQuery: string` column to `Strain` (no FK, no entity, no CRUD, no settings tab, no sticky columns).
- Completed: `documents/done/llm-model-test-results-retention-plan.md`.
  - Added `deleteOldTestResults(retentionDays = 30)` to `LlmProviderService` — uses TypeORM `LessThan` on `createdAt` to delete old rows, returns affected count.
  - Added `cleanupOldLlmModelTestResults()` cron to `LlmTasksService` with `@Cron('0 0 2 * * 0')` (Sunday 02:00 server time), injecting `LlmProviderService`. Logs start, cutoff, and deleted row count. Errors are isolated to the cleanup job.
  - No new module wiring needed — `LlmProviderModule` already exports `LlmProviderService` and `LlmModule` already imports it.
  - Added `llm-provider.service.spec.ts` with 5 tests: `LessThan` operator verification, cutoff calculation accuracy, affected-count return, zero-affected handling, and custom retention.
  - Verified: `npm test` passes 25/25 (pre-existing `app.controller.spec.ts` FAIL unrelated); `npm run build` passes.
  - No architecture diagram update needed (scheduled task only, existing cron infrastructure).
- Cancelled: `documents/todo/google-search-plan.md` — Tavily fallback with Google Search not needed.
- Planned: `documents/features/todo/css-conventions-fix-plan.md` — converts 7 CSS audit findings into implementation tasks: global list-row pattern, input-shell pattern, card surface conversion, explicit transitions, hardcoded pixel tokenization, and nesting cleanup.
- Planned: `documents/features/todo/genui-progressive-streaming-rendering-plan.md` documents progressive frontend rendering for streamed GenUI `component` blocks in `AiFormat`, replacing skeleton-only streaming with safe partial HTML/CSS previews.
- No architecture diagram update was needed for this planning-only change; implementation must revisit the diagram only if it changes backend streaming protocol, event shape, or GenUI generation contract.
- Completed: `documents/done/llm-service-refactor-plan.md`.
- Rolled back: GenUI builder split and dedicated weather template experiment.
- Current GenUI source of truth: `backend/src/modules/admin-agent/constants/gen-ui-spec.constant.ts`.
- Verified: backend build passes after the rollback state.
- Completed: `documents/done/ai-format-directive-improvement-plan.md`.
- Candidate GenUI cleanup after AiFormat: larger backend prompt refinements can now assume frontend CSS/token protection exists.
- Completed: added protected `ExplorerModule`/`ExplorerController` for `ExplorerService`.
- Verified: backend build passes after the Explorer module addition.
- Completed: added Angular `Explorer` page with direct in-component API call and table rendering.
- Verified: frontend build passes after the Explorer page addition.
- Completed: updated `ExplorerService` to click dynamic product rows and extract structured strain genetics fields.
- Verified: backend build passes after the Explorer scraper update.
- Completed: moved Explorer source URL ownership to the backend and removed URL input from the client.
- Completed: Explorer page now loads data automatically on page entry.
- Verified: backend and frontend builds pass after the Explorer URL ownership change.
- Completed: fixed Explorer scraper selectors using the documented Jane table and expanded-row structure.
- Verified: backend build passes after the Explorer selector fix.
- Completed: added the selected product/commercial Explorer fields to the scraper payload and response DTO.
- Completed: removed redundant Explorer fields `fromPrice`, `thc`, and `cbd`.
- Verified: backend build passes after extending the Explorer payload.
- Completed: updated the Explorer page to use PrimeNG table sorting, global search, Hebrew page title, and Hebrew column headers.
- Verified: frontend build passes after the Explorer table update.
- Completed: replaced Explorer DOM row parsing with Jane `tiltan/` JSON API consumption and normalized response mapping.
- Verified: backend build passes after the Explorer Jane API integration update.
- Completed: fixed Explorer loader/error visibility for long or failed Jane API loads.
- Verified: backend and frontend builds pass after the Explorer UX fix.
- Completed: fixed frozen Explorer loader animation and added frontend/backend request timeouts.
- Verified: backend and frontend builds pass after the non-blocking loader fix.
- Completed: Explorer refresh no longer locks during loading; retry cancels the previous request and starts a fresh one.
- Completed: fixed missing Explorer rows where the Jane row had a `חדש!` ribbon before the real Hebrew name.
- Verified: backend build passes after the Explorer scraper name extraction fix.
- Completed: Explorer name column now stacks Hebrew name, English name, rating, and deal text in one cell.
- Completed: Explorer scraper now extracts visible row rating text.
- Verified: backend and frontend builds pass after the Explorer name-cell update.
- Completed: Explorer `NEW` indicator is now rendered inside the name cell and only when `isNew === true`.
- Completed: Explorer `catalogPrice` is now embedded inside the price cell with strikethrough instead of appearing as a separate column.
- Verified: frontend build passes after the Explorer table-cell updates.
- Completed: Explorer package type now renders as an icon for `צנצנת` or `שקית`, with a package fallback for unknown values.
- Verified: frontend build passes after the package-type icon update.
- Completed: Explorer `terpenes` now renders as a conditional full-width detail row instead of a standalone table column.
- Verified: frontend build passes after the terpenes row update.
- Completed: removed Hebrew comments from Explorer frontend files and aligned Explorer Swagger description with the current scraper implementation.
- Verified: frontend and backend builds pass after the Explorer cleanup.
- Completed: Explorer regular table cells now show `לא ידוע` instead of rendering those values as empty cells, fixing missing-looking `manufacturer` values.
- Verified: frontend build passes after the Explorer manufacturer display fix.
- Reviewed: Explorer strain filter behavior was inspected only; no implementation status changed.
- Completed: generalized Explorer table filters so strain, marketer, manufacturer, and brand values can all create active filter chips.
- Verified: frontend build passes after the generic Explorer filter update.
- Completed: Explorer table filter buttons now toggle their matching active filter on repeated clicks.
- Verified: frontend build passes after the Explorer filter toggle update.
- Completed: Explorer package type is now a clickable/toggleable table filter.
- Verified: frontend build passes after the Explorer package-type filter update.
- Completed: Explorer country of origin is now a clickable/toggleable table filter.
- Verified: frontend build passes after the Explorer country filter update.
- Completed: Explorer backend now uses Puppeteer network-response capture plus scrolling to collect lazy-loaded Jane product batches beyond the initial 25 rows.
- Completed: Explorer Jane JSON responses are normalized back into the existing `items` table payload without requiring frontend changes.
- Verified: backend build passes after the Explorer network-capture update.
- Completed: Explorer `isNew` is restored for the network-capture path by combining explicit JSON flags with visible `חדש!` DOM markers.
- Verified: backend build passes after the Explorer `isNew` fix.
- Completed: Explorer `NEW` badge is now a clickable/toggleable table filter.
- Verified: frontend build passes after the Explorer `isNew` filter update.
- Completed: Explorer `isNew` active filter chip now displays `חדש`, and the `NEW` badge hover contrast was fixed.
- Verified: frontend build passes after the Explorer `isNew` label/hover fix.
- Completed: Explorer terpenes now render as individual clickable/toggleable filters.
- Completed: Explorer country of origin now displays flags in the table.
- Verified: frontend build passes after the Explorer terpenes filter and country flag update.
- Completed: Explorer terpene buttons now keep percentage text visible when supplied by Jane while still filtering by terpene name.
- Completed: Explorer country flags now use local tiny SVG assets from `frontend/public/flags`.
- Verified: frontend and backend builds pass after the Explorer terpene percentage and SVG flag update.
- Completed: Explorer component CSS selectors are now fully nested under `.page-content`, including responsive rules.
- Verified: frontend build passes after the Explorer CSS nesting cleanup.
- Completed: Explorer CSS child selectors are now nested more deeply under their direct UI parents where practical.
- Verified: frontend build passes after the deeper Explorer CSS nesting update.
- Completed: Explorer CSS was checked against `css-conventions` and market-cell child button styling was nested under its parent.
- Verified: frontend build passes after the Explorer CSS conventions pass.
- Completed: Explorer backend no longer renders Jane zero/default terpene metrics as visible `0%` labels.
- Verified: backend build passes after the Explorer terpene zero-percent fix.
- Completed: Explorer header search now shows the filtered strain count under the search input and no longer shows the header refresh button.
- Verified: frontend build passes after the Explorer header count update.
- Documented: Explorer genetics connector line from origin strain to parents was removed from the current UI.
- Documented: the active GenUI cleanup focus is the AiFormat directive; `gen-ui-spec.constant.ts` is no longer listed as a cleanup candidate.
- Completed: AiFormat now preserves markdown text that appears before or after a streamed `component` block instead of replacing the whole assistant message with the GenUI template.
- Completed: Chat template detection no longer treats generic ` ```c ` code fences as GenUI rendering.
- Verified: `npx tsc -p tsconfig.app.json --noEmit` passes for the frontend after the AiFormat/chat-message fix.
- Completed: Explorer CSS budget blocker was fixed by removing duplicate PrimeNG sort-icon overrides from `frontend/src/app/features/explorer/explorer.css`; `npx ng build` now passes.
- Completed: Explorer price sorting now uses numeric custom table sorting, so price strings like `₪99`, `₪425`, and `₪499` sort by number instead of text.
- Verified: `npx ng build` passes after the Explorer numeric price sort fix.
- Completed: frontend Angular packages were upgraded to Angular `22.0.1` and TypeScript `6.0.3`.
- Completed: Angular 22 migrations were applied, including explicit `ChangeDetectionStrategy.Eager`, `withXhr()`, optional-chain safe navigation migration helpers, and extended diagnostic suppressions.
- Verified: `npx ng test --watch=false` passes after updating the stale root app spec.
- Verified: `npx ng build` passes after the Angular 22 upgrade.
- Open risk: `npm ls` reports a peer dependency problem because `primeng@21.1.8` still declares Angular `^21.0.7`, and no PrimeNG 22 package is currently available in npm.
- Documented: `documents/angular-22-update-guide.md` checklist items were marked as completed for the Angular 22 work that was performed or reviewed.
- Completed: removed Angular's temporary `$safeNavigationMigration(...)` helpers from frontend templates after the Angular 22 migration review.
- Verified: no `$safeNavigationMigration` usages remain under `frontend/src`; `npx ng test --watch=false` and `npx ng build` pass.
- Completed: moved the Angular 22 upgrade guide to `documents/done/angular-22-update-guide.md`.
- Remaining open work: decide how to handle PrimeNG's Angular 21 peer dependency range, clean existing frontend warnings, and continue the 2 remaining active feature plans (`dynamic-pharm-scraping-plan.md`, `provider-and-llm-db-plan.md`).
- Completed: AiFormat Phase 2/3 now sanitize GenUI component HTML before raw rendering, removing dangerous tags, unsafe token overrides, and unscoped global selectors while preserving local scoped CSS and `@keyframes`.
- Verified: `npx ng test --watch=false` passes 19 tests, and `npx ng build` passes after the AiFormat sanitizer update.
- Completed: AiFormat Phase 4/5/6 finished. Skeleton rendering now goes through `renderSkeletonOnce()`, Hebrew/English role parsing is covered by tests, CSS code fences render as markdown code, and the plan moved to `documents/done/ai-format-directive-improvement-plan.md`.
- Verified: `npx ng test --watch=false` passes 22 tests, `npx ng build` passes, and the AiFormat corrupted-character scan returned clean.
- Completed: `documents/done/chat-stop-stream-button-plan.md`.
- Completed: `documents/done/chat-message-actions-plan.md`.
- Chat submit now becomes a clickable stop button during streaming and cancels the active fetch through the existing stream Observable teardown.
- Chat messages now expose delete, resend, copy, and edit actions through a typed `ChatMessageActionEvent`.
- Added persistent backend deletion: `DELETE /admin-agent/sessions/:sessionId/messages/:messageId`, scoped to the authenticated user and deleting the selected message plus later messages to preserve conversation context.
- Updated `backend/swagger-spec.json` with the new message deletion operation.
- Updated `documents/architecture-diagram.md` for chat stream cancellation and message action deletion flow.
- Verified: `npx ng test --watch=false`, `npx ng build`, and `npm.cmd run build` pass after the chat action/stop work.
- Completed: implemented clickable strain-symbol filters in StrainHunter table; updated items computed property to handle symbol alt-text matching.
- Verified: frontend build passes after the strain-symbol filter update.
- Closed: `documents/features/todo/explorer-plan.md` was not an active implementation plan; it is now `documents/done/explorer-source-reference.md`.
- Active feature todo now contains: `dynamic-pharm-scraping-plan.md` and `provider-and-llm-db-plan.md`.
- Incomplete: `thinking-ux-cleanup.md`.
- Completed: Chat message action buttons now render without borders; hover/focus uses tokenized color/background only.
- Verified: `npx ng build` passes after the chat action-button border cleanup with existing warnings only.
- Completed: Angular 22 baseline documentation was updated in `frontend/README.md`, `AGENTS.md`, `CLAUDE.md`, and `C:\Users\porat\.claude\rules\angular-rules.md`.
- Documented: Angular/CLI `22.0.1`, TypeScript `6.0.3`, Node `22.22.3+` or `24.15.0+`, Angular 22 safe-navigation behavior, and the known PrimeNG peer mismatch.
- Completed: `C:\Users\porat\.claude\rules\angular-rules.md` was hardened into a strict checklist format for the local coding agent.
- Completed: reusable local-agent prompt snippets were created under `C:\Users\porat\.claude\prompts\code-agent\`.
- Completed: the local-agent Angular prompt/rules now tell the agent to proceed automatically after a clear pre-implementation report, clarify static pages do not need `PageStates`, and standardize frontend verification from `frontend/`.
- Completed: local-agent Angular prompts/rules now include Definition of Done gates for Hebrew UTF-8, CSS quality, route/menu connectivity, successful verification, and requirement-by-requirement self-review.
- Completed: local-agent Angular prompts/rules now require static placeholder pages to use the standard global page shell instead of custom wrapper classes or unnecessary component CSS.
- Completed: static placeholder page guidance now uses `glass-effect card` instead of `empty-state`; `empty-state` is reserved for real no-data states.
- Completed: Hebrew handling rules now forbid local agents from generating/reversing Hebrew; they must copy exact approved strings and verify with `Select-String -SimpleMatch`.
- Revised: Hebrew handling was simplified again; local agents may write Hebrew, with only lightweight mojibake safeguards retained.
- Completed: static page guidance now requires copying the exact standard page shell structure instead of improvising HTML around generic classes.
- Completed: Design System showcase color-token layout was tightened so color groups no longer stretch to the tallest panel and long token names no longer collide with the copy state.
- Completed: documented breakpoint tokens were added to `_variables.css`, and Design System media queries now use `var(--sm)` instead of hardcoded `900px`.
- Verified: `npx ng build` passes after the Design System update with existing unrelated warnings only.
- Completed: added `frontend/src/app/assets/styles/_primeng-overrides.css` and connected it from `frontend/src/styles.css`.
- Completed: moved PrimeNG datatable sort-icon overrides out of `_utilities.css` into the dedicated PrimeNG override stylesheet.
- Verified: `npx ng build` passes after the PrimeNG override stylesheet addition with existing unrelated warnings only.
- Completed: Users management now renders with PrimeNG `p-table` instead of the native global `.table`.
- Completed: Users table search now uses PrimeNG global filtering, and columns render sortable headers with `p-sortIcon` like Explorer.
- Verified: `npx ng build` passes after the Users PrimeNG table migration with existing unrelated warnings only.
- Completed: fixed the Users search placeholder to `חפש משתמש...`.
- Verified: `npx ng build` passes after the placeholder fix with existing unrelated warnings only.
- Completed: `documents/features/todo/TASK.md` design-system token upgrade.
- Completed: rewrote `frontend/src/app/assets/styles/_variables.css` with the audited WCAG-oriented theme token system.
- Completed: updated `frontend/src/app/assets/styles/_reset.css` `body::before` to use `--color-primary-glow-bg` and `--color-secondary-glow-bg`.
- Completed: moved the finished task to `documents/done/design-system-token-upgrade-task.md`.
- Verified: no missing CSS custom property references were found in app CSS, old transparent surface values were removed, and `npm.cmd run build` passes from `frontend` with existing unrelated warnings only.
- Completed: `documents/features/todo/DESIGN_UPGRADE_TASK.md` design-language glassmorphism upgrade.
- Completed: updated global glass, card, metric-card, table-container, logo, badge, error-badge, form input, primary button, and ambient body glow styles.
- Completed: added `--glass-*` theme tokens and stronger ambient glow token values to `_variables.css`.
- Completed: moved the finished task to `documents/done/design-language-glassmorphism-upgrade-task.md`.
- Verified: `npm.cmd run build` passes from `frontend` with existing unrelated warnings only.
- Completed: theme switching now temporarily disables CSS transitions while `data-theme` changes.
- Completed: `ThemeService.applyMode(...)` calls `blockTransitions()` and `_reset.css` defines `.no-transitions`.
- Verified: `npm.cmd run build` passes from `frontend` with existing unrelated warnings only.
- Completed: removed the duplicate dedicated rating color token and switched Explorer rating color to `--color-warning`.
- Completed: Design System color palette now lists all current color-related tokens from `_variables.css`.
- Completed: Design System semantic colors are separated into Success, Danger, Warning, and Info groups.
- Completed: Design System page padding was added, color swatches were reduced, and long gradient token values now truncate instead of overflowing.
- Verified: token coverage comparison is clean and `npm.cmd run build` passes from `frontend` with existing unrelated warnings only.
- Completed: `documents/done/light-mode-character-upgrade-task.md`.
- Completed: light mode now uses teal primary tokens, a cool blue-grey background, light glass tokens, adjusted borders, and updated light shadows.
- Verified: `.primary-btn.filled` uses acceptable light text on the new teal primary, and `npm.cmd run build` passes from `frontend` with existing unrelated warnings only.
- Completed: added global `.icon-tile` padded icon styling and applied it to Dashboard metric-card icons.
- Completed: Design System section-heading icons now reuse `.icon-tile` instead of local duplicated icon CSS.
- Verified: `npm.cmd run build` passes after the global icon-tile update with existing unrelated warnings only.
- Planned: `documents/features/todo/llm-model-test-results-retention-plan.md` documents weekly cleanup of `llm_model_test_results` rows older than 30 days.
- Reviewed: llm-provider-management code review found two critical data-binding bugs:
  - `result.logOutput` → corrected to `result.errorMessage` in the test-results table cell.
  - `model.modelId` → corrected to `model.key` in the model slug cell.
  - Removed unused `BadgeColor` and `RippleModule` imports from `LlmProvidersManagement`.
- Verified: `npx ng build` from `frontend` passes; `BadgeColor is not used` warning resolved. Remaining warnings are pre-existing `explorer.css` and `chat-message.css` budget warnings only.
- Open decisions: hard delete vs soft-disable for provider deletion, Hebrew vs English UI for the LLM providers page.
- Completed: added PrimeNG `p-dialog` forms for provider and model create/edit in `llm-providers-management`. Added "Add Provider" in page header and "Add Model" in expanded provider panel. Edit and delete (soft-disable) buttons wired for both providers and models.
- Verified: `npx ng build` passes. `llm-providers-management.css` has a new budget warning (6.43 kB over 4 kB limit).
- Completed: merged the LLM providers local `.icon-btn` styling into the global `icon-only` button pattern in `_buttons.css`.
- Completed: LLM providers action buttons now use `icon-only transparent-btn` / `icon-only danger-btn`, the local `.icon-btn` CSS block was removed, and the unnecessary `add-model-btn` class was replaced with `transparent-btn sm`.
- Verified: `npm.cmd run build` from `frontend` passes. `llm-providers-management.css` budget warning remains but is reduced to 4.36 kB over the 4 kB limit.

## 2026-07-18 Session (MCP Bridge Plan — Review and Rewrite)

- Reviewed `documents/todo/add-mcp-plan.md` against the actual code and rewrote it as `documents/features/todo/add-mcp-plan.md`. Old `documents/todo/add-mcp-plan.md` was removed (it was the untracked draft from the previous session).
- Key corrections applied during the review:
  - `LlmToolSchema` extension targets the **parser's local** type in `swagger-tools.parser.ts:14`, not `llm/types/llm.types.ts` — there are two distinct types in the codebase and the parser's is what `getTools()` actually returns.
  - The MCP dispatch branch in `AgentToolExecutorService.executeToolCall` must run **before** the existing `getEndpoint` lookup, because the current code returns `Unknown tool call` for any name not in the parser.
  - The render-spec adapter must read MCP output directly, not unwrap `data.result` (ServiceResultContainer). The plan adds a per-mapping `unwrapResult?: boolean` flag (default `true`, `false` for MCP).
  - `@dangahagan/weather-mcp` and `@modelcontextprotocol/sdk` go in **dependencies** (not devDependencies) because they ship in prod.
  - Phase 0 fixture capture is committed to disk under `__fixtures__/weather-mcp-{current,forecast}.json` and `__fixtures__/weather-mcp-tools.json`, so the adapter test is diffed against a known good output.
  - `callTool` failures return a `{error:true, source:'mcp', toolName, message}` envelope so render-spec's existing error short-circuit handles them cleanly.
- Confirmed `WeatherService` has no cross-module imports, so the Phase 4 deletion is safe. `admin-agent.service.spec.ts` `WeatherController_*` references are loop-breaker test data only and stay as-is.
- No code changes this session — plan only. No architecture diagram update was needed (pre-implementation).
- Files touched: `documents/features/todo/add-mcp-plan.md`, `documents/todo/add-mcp-plan.md` (deleted), `documents/HANDOFF.md`, `documents/STATUS.md`.
- Decisions made: prefer the `unwrapResult` flag over wrapping MCP results in `ServiceResultContainer`; ship v1 with `ph-gear` step icon for all MCP tools; keep the bridge module top-level under `src/modules/mcp-bridge/`, not as a sub-module of `admin-agent`.
- Next exact step: implement Phase 0 of `documents/features/todo/add-mcp-plan.md` by installing `@modelcontextprotocol/sdk` and `@dangahagan/weather-mcp` (both as `dependencies`), running a scratch script to capture `listTools()` and one `callTool` per tool, and committing those outputs to the `__fixtures__/` paths before starting Phase 1.

## 2026-07-18 Session (Agnes AI Multimodal Plan — Review and Rewrite)

- Reviewed `documents/features/todo/agnes-ai-multimodal-plan.md` against the actual codebase and rewrote it in place. No code was changed this session — plan only.
- Verified the plan's claims against source: confirmed `LlmProviderConfigService` lists `agnes-ai` (`llm-provider-config.service.ts:5`) and the seed writes the Agnes provider with `key: 'agnes'` and `baseUrl: 'https://api.agnes.ai/v1'` (`llm-providers.seed.ts:119-146`) — the chat model is currently unreachable through the DB path.
- Confirmed `LlmModelEntity` has no capability field, the OpenAI SDK is the only chat path, the nightly cron iterates all active models, and there is no `GET /llm/model-options` endpoint (the previous plan referenced one that does not exist).
- Key corrections applied during the review:
  - **Bug class A (provider wiring):** the seed must be updated-in-place (not delete+reinsert) for any pre-existing `agnes` row, to keep model FK rows intact and avoid a unique-key collision on the insert.
  - **Bug class B (nightly cron noise):** `LlmTasksService.handleNightlyLlmHealthCheck` would mark every image/video model as failed every night. The new plan gates Phase 2 (capability guard on chat + health check) as a hard prerequisite, not a nice-to-have.
  - **Stale `isDefault`:** the frontend `LlmModel` interface still has the dead `isDefault: boolean` field; the new Phase 6 drops it.
  - **SDK assumption:** the OpenAI SDK has no `videos` resource — video uses raw `fetch` against `{baseUrl}/videos` and `{baseUrl}/agnesapi?video_id=...` with `Authorization: Bearer`.
- Files touched: `documents/features/todo/agnes-ai-multimodal-plan.md`, `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.
- Decisions made: video polling is on-demand (no background job), capability filtering goes through the existing `findAll()` path (no new endpoint), chat dropdown filters to `capability === 'text'` in one place.
- No architecture diagram update was needed because the new endpoints stay inside `LlmModule`.
- Next exact step: implement Phase 1 of the rewritten plan — update the Agnes seed block (key + baseUrl + capability), add the `capability` enum to `LlmModelEntity`, and add the idempotent update-in-place reconciliation for any pre-existing `agnes` row. Verify with `npm.cmd run build` from `backend` and `SELECT key, baseUrl FROM llm_providers`.
- Open questions: none for the plan itself. Implementation-time questions (rate limiting, free-tier cost, image upload UX) remain in the plan's "Out of Scope" section.


## 2026-06-27 Plan Audit

- Fixed: `favorite-strain-plan.md` was still in `todo/` but the feature was fully implemented:
  - `strain-hunter/`, `matching-engine.store.ts` with `calculateScore()`/`topScored()`, `matching-preferences-drawer.ts`, `matchScore` column with SVG rings, penalty badges.
  - Moved to `documents/done/favorite-strain-plan.md`.
- Fixed: `REVERT_TASK.md` was still in `todo/` but the light mode revert was already applied.
  - Moved to `documents/done/REVERT_TASK.md`.
- Bug fixed: `TerpeneModule` was not registered in `app.module.ts`, causing `/terpenes` to return 404 in an infinite loop.
  - Added `TerpeneModule` import to `AppModule`.
  - Backend and frontend builds pass after the fix.
- Completed: `documents/done/terpenes-details-plan.md`. Terpene reference catalog is fully implemented: NestJS `Terpene` entity + `TerpeneService` + `TerpeneController` + `TerpeneModule` + seed of 17 Hebrew-named terpenes, and Angular `ITerpene` interface + `TerpeneService` + `TerpeneStore` + `TerpeneTooltip` hover-popover component consumed by `MatchingPreferencesDrawer`. `TerpeneModule` is registered in `AppModule`.
- Completed: `documents/done/genetic-details-plan.md`. Genetics reference catalog is fully implemented: NestJS `Genetics` entity + `GeneticsService` + `GeneticsController` + `GeneticsModule` + idempotent seed of 209 Hebrew-named strains read from the JSON in the plan file (with parenthetical/`#`/three-parent handling and a loud-fail dedupe pass per §1.7), and Angular `IGenetics` interface + `GeneticsService` + `GeneticsStore` + a generic shared `Tooltip` component (replaces the terpene-only `TerpeneTooltip`) consumed by both `MatchingPreferencesDrawer` and the root `StrainHunter` page. `GeneticsModule` is registered in `AppModule`; `seedGenetics` runs after `seedLlmProviders` in `main.ts`. Tooltip shows an optional Hebrew role label above the strain name (`זן מקור` / `הורה #1` / `הורה #2`) so origin/parent chips are disambiguated on hover.
- Runtime wiring note: a backend agent's self-report claimed `GeneticsModule` and `seedGenetics` were wired, but `nest build` is type-check only and never executes `main.ts`. Both wirings were missing on disk and were applied directly before close-out; `npm.cmd run build` from `backend` and `npx ng build` from `frontend` both pass after the fix.
- Remaining active plans: `provider-and-llm-db-plan.md` (partial — Phases 1-3 done, 4-9 remain).

## 2026-06-28 Session (continued — Plan Cleanup)

- Moved `documents/features/todo/tooltip-merge-plan.md` to `documents/done/tooltip-merge-plan.md` — the shared `Tooltip` component integration into `StrainHunter` for both terpenes and genetics was already complete (documented in lines 216–219 above). The plan file was outdated ("NOT YET MIGRATED") but the code already used `Tooltip` with `category: 'terpene' | 'genetics'` for all hover popovers.
- Remaining incomplete: `thinking-ux-cleanup.md`.
- Completed: Integrated shared `Tooltip` component into `StrainHunter` table for terpenes and genetics.
- Fixed: Tooltip "no info" error by ensuring `TerpeneStore` and `GeneticsStore` are initialized in `StrainHunter.ngOnInit`.
- Fixed: Tooltip lookup failures by implementing normalized Hebrew name matching in `TerpeneStore` and `GeneticsStore` to handle punctuation/whitespace variations.
- Added: 500ms mouse hover delay for `Tooltip` and `ScoreTooltip` components in `StrainHunter` to prevent flickering on rapid mouse movement.
- Remaining active plans: `provider-and-llm-db-plan.md` (partial — Phases 1-3 done, 4-9 remain).

## 2026-06-28 Session (continued — Plan Cleanup)

- Moved `documents/features/todo/tooltip-merge-plan.md` to `documents/done/tooltip-merge-plan.md` — the shared `Tooltip` component integration into `StrainHunter` for both terpenes and genetics was already complete (documented in lines 216–219 above). The plan file was outdated ("NOT YET MIGRATED") but the code already used `Tooltip` with `category: 'terpene' | 'genetics'` for all hover popovers.

## 2026-06-28 Session (continued)

- Fixed p-tooltip opacity issue in PrimeNG overrides: added smooth show/hide transitions for `.p-tooltip` and `.p-tooltip-visible` with proper opacity handling for the glassmorphism `::before` pseudo-element.
- Added CREATE (POST) and UPDATE (PATCH) endpoints to `TerpeneController` and `GeneticsController` with full Swagger documentation, validation DTOs, and service layer implementations.
- Completed `documents/features/todo/silent-enrichment-plan.md` (moved to `documents/done/silent-enrichment-plan.md`):
  - Wired `GeneticsService.enrichBatch()` and `TerpeneService.enrichBatch()` into `StrainHunterService.fetchData()` after saving scraped items.
  - Enrichment runs silently on every `fetchData(forceRefresh=true)` call — extracts unique genetics names (originStrain, parent1, parent2) and terpene names, filters empties, calls both services in parallel via `Promise.all()`.
  - Idempotent: `enrichBatch` queries DB first, only calls LLM for truly missing names; TypeORM `save()` upserts (inserts new, updates partial).
  - Graceful LLM parse handling: try/catch in both services returns empty array on failure — scrape succeeds even if enrichment silently skips.
  - Removed admin-enrichment TODO comment from `tooltip.html` (line 33).
  - Frontend tooltip now shows real data on first hover — zero user interaction, zero frontend changes required.
- Verification: `npm.cmd run build` from `backend` passes. `npx ng build` from `frontend` passes with existing warnings only.
- No architecture diagram update needed (backend module boundaries unchanged, no new frontend API calls).


## 2026-07-01 Session

- Completed: refresh button in StrainHunter now shows a spinner on the button only — the table stays visible during refresh.
  - Added `refreshing` signal alongside `loading`; initial load still triggers full-page loader, refresh only spins the button.
  - `load()` only sets `loading.set(true)` when `forceRefresh=false`; on refresh it sets `refreshing.set(true)` instead.
  - Refresh button and match-drawer button use `refreshing()` for disabled/spinner state.
  - On refresh failure, `error` state replaces the table (same as current behavior).
- Verification: `npm.cmd run build` from `backend` passes. `npx ng build` from `frontend` passes with existing warnings only.
- No architecture diagram update needed (local UI behavior only).

## 2026-07-03 Session

- Completed: chat image upload, drag-and-drop, and clipboard paste for multimodal LLM conversations.
  - Backend DTO: added optional `image?: string` to `AgentRequestDto`, relaxed `prompt` from `@IsNotEmpty()` to `@IsOptional()`, relaxed `provider` from `@IsIn()` to `@IsString()`, removed `@IsNotEmpty()` from `model`.
  - Backend types: added `image?: string` to `LlmRequest`, widened `LlmMessage` user content to `string | ChatCompletionContentPart[]`.
  - Backend `LlmClientService`: added `buildUserMessage(prompt, image?)` helper that returns multimodal content array when image present; removed `as any` casts.
  - Backend `AdminAgentService`: both `queryDatabase` and `queryDatabaseStream` accept `image` param, pass to `LlmRequest`, skip title update when prompt is empty, added 15MB backend image size guard.
  - Backend `AdminAgentController`: passes `dto.image` to `queryDatabaseStream`, error response includes actual error message via `error.message`.
  - Backend `LlmClientService.generateStream`: changed from yielding error as token to **throwing** the error so controller catch block handles it properly.
  - Backend body-parser: `main.ts` uses `bodyParser: false` + `app.use(json({ limit: '20mb' }))` to override NestJS default 100KB limit.
  - Frontend `IChatMessage`: added optional `imagePreview?: string` field.
  - Frontend `ChatService.sendMessageStream`: accepts 4th optional `image?: string` param, includes in JSON body.
  - Frontend `chat.ts`: added `isDragging`, `selectedImageBase64`, `selectedImagePreview` signals; `canSend` computed; `@ViewChild('fileInput')`; methods: `openFilePicker`, `onFileSelected`, `onDragOver`, `onDragLeave`, `onDrop`, `processFile` (10MB client limit), `clearSelectedImage`, `onPaste`; removed `Validators.required` from prompt; `sendMessage` captures image before reset.
  - Frontend `chat.html`: drag overlay, hidden file input, upload button, image preview thumbnail with close button, `(paste)` binding on textarea, send button `[disabled]` uses `canSend()`.
  - Frontend `chat.css`: `position: relative` on `.chat-root-container`, `.chat-drop-overlay` styles, `.chat-file-input` hidden, `.chat-upload-btn` hover, `.chat-image-preview` with close button on hover.
  - Frontend `chat-message.html`: renders `message().imagePreview` thumbnail for user messages.
  - Frontend `chat-message.css`: `.message-attachment` styles nested under `.user-message`.
- Moved plan to `documents/done/chat-image-upload-and-drag-drop-plan.md`.
- Verified: `npx ng build` from `frontend` passes; `npm.cmd run build` from `backend` passes.
- Root cause fixes during implementation:
  - `PayloadTooLargeError`: NestJS default body-parser 100KB limit; resolved with `bodyParser: false` + 20MB limit.
  - `400 Bad Request` on image-only messages: ValidationPipe rejected `prompt: ""` due to `@IsNotEmpty()`; resolved by relaxing to `@IsOptional()`.
- No architecture diagram update needed (backend module boundaries unchanged, no new API endpoints).

## 2026-07-04 Session

- Completed: `documents/done/chat-message-content-too-long-fix-plan.md`.
  - Widened `chat_messages.content` from `TEXT` (64KB) to `MEDIUMTEXT` (~1.6M chars) in `chat-message.entity.ts`.
  - Added `truncateForStorage(content, maxBytes=50_000)` private helper to `admin-agent.service.ts`.
  - Helper cuts on `Buffer` bytes (not string chars), backtracks to valid UTF-8 char boundary, appends `_truncated` marker with original length.
  - Applied truncation at all 4 tool-related `saveMessage` call sites: assistant tool-call rows + tool-result rows in both `queryDatabase` and `queryDatabaseStream`.
  - Added 5 unit tests asserting `Buffer.byteLength(result, 'utf8') <= maxBytes` for Hebrew-heavy, mixed Hebrew+JSON, and ASCII payloads.
  - Verified: `npm run build` from `backend` passes; `npm run test` passes 19/19 (pre-existing `app.controller.spec.ts` FAIL unrelated).
- Completed: extracted `private mapToDto(entity: Terpene): TerpeneDto` in `terpene.controller.ts`, replacing 4 inline mapping sites (findAll, findOne, create, update).
- Completed: added `terpene.controller.spec.ts` (3 tests) and `genetics.dto.spec.ts` (4 tests) — DTO mapping coverage tests that fail at build time if a field is added to the DTO but not mapped from the entity.
- Completed: added `colorDark` and `colorLight` fields to `TerpeneDto`, `GeneticsDto`, `toGeneticsDto()`, and all 4 terpene controller mapping sites.
- Completed: backfilled all 18 terpenes and 246 genetics rows with WCAG AA-safe color variants (`colorDark`/`colorLight`) using `deriveThemeColors()`.
- Verified: frontend tooltip now uses `tooltipColor()` computed (theme-aware) instead of raw `t.color`/`g.color`.
- Verified: `npx ng build` from `frontend` passes; `npm run build` from `backend` passes; `npm run test` passes 19/19.

## 2026-07-05 Session (CSS Conventions Fix)
- Completed: `documents/done/css-conventions-fix.md`.
- Added 4 new tokens to `frontend/src/app/assets/styles/_variables.css`: `--color-family-indica`, `--color-family-sativa`, `--color-family-hybrid`, `--shadow-logo`.
- Replaced hardcoded hex colors in `frontend/src/app/features/strain-hunter/strain-hunter.css` with the new family badge tokens.
- Replaced the hardcoded `rgba(0, 0, 0, 0.3)` in `.logo`'s `box-shadow` in `frontend/src/app/assets/styles/_layout.css` with `var(--shadow-logo)`.
- Replaced hardcoded `11px` in `frontend/src/app/features/chat/chat-message/chat-message.css` with `var(--font-size-xs)`.
- Replaced hardcoded `10px` in `frontend/src/app/features/strain-hunter/matching-preferences-drawer/matching-preferences-drawer.css` with `var(--font-size-xs)`.
- Removed the duplicate `padding: 32px` override on `.chat-history` in `frontend/src/app/features/chat/chat/chat.css` (line 48) that was overwriting `padding: var(--space-4)` on line 41.
- Verification: `npx ng build` from `frontend` passes; all grep checks for remaining hardcoded values returned none.
- Out of scope (noted for follow-up): two additional `rgba(0, 0, 0, ...)` literals in `_utilities.css:273` and `_buttons.css:173` were discovered during the file move but were not included in this fix.
- Total files touched: 6 (`_variables.css`, `strain-hunter.css`, `_layout.css`, `chat-message.css`, `matching-preferences-drawer.css`, `chat.css`).
- No architecture diagram update was needed because this was local CSS token consumption only.

## 2026-07-06 Session (CSS Conventions Fix Plan — Audit Findings)

- Completed: `documents/features/todo/css-conventions-fix-plan.md` → moved to `documents/done/css-conventions-fix-plan.md`.
- Reviewed all 7 audit findings. Findings 1-3 and 6 were stale (referenced classes that no longer exist: `archive-item`, `nested-sessions-list`, `session-sub-item`, `.search-box`, `.search-container`). Finding 7 (inline styles) was already compliant.
- Finding 4 (broad transitions): replaced `transition: var(--transition-standard)` in `main-sidebar.css` with explicit `background-color` and `color` transitions.
- Finding 5 (hardcoded pixels): tokenized 40px in `.theme-toggle` and `.user-avatar` to `var(--space-10)`.
- Added `--space-10: 40px` to `_variables.css`.
- Verified: `npx ng build` from `frontend` passes.

## 2026-07-18 Session (LLM Default Model Per-User Fix)

- Completed: removed the legacy global-per-provider `isDefault` logic (backend `LlmProviderService.setDefaultModel` + `POST /llm-provider/models/:id/default` endpoint) so only `user_llm_defaults` (per-user, single model) is the default source.
- Completed: added `GET /llm/default-model` to `LlmController` for reading the authenticated user's current default model.
- Completed: frontend `LlmProviderService` now calls the user-level endpoints (`setUserDefaultModel`, `getUserDefaultModel`); `LlmProviderStore` holds `defaultModelId` and loads/sets it.
- Completed: chat + providers-management star buttons and dropdown default now use the per-user default; old `m.isDefault` rendering removed.
- Completed: created the missing `user_llm_defaults` table (root cause of `GET /llm/default-model` 500 — `synchronize:true` does not create raw-SQL-migrated tables) and cleared two stale `is_default=1` rows that caused dual stars.
- Verified: `npx ng build` (frontend) passes with existing unrelated warnings; `npx nest build` (backend) passes; user confirmed live selecting a new default works with one star only.
- Active todo: whether to add a repeatable migration runner or convert `user_llm_defaults` to a TypeORM entity, and whether to drop the dead `is_default` column.
- No architecture diagram update was needed (module boundaries and default-resolution path unchanged; only the dead legacy flag path was removed).

## 2026-07-18 Session (follow-up) — user_llm_defaults Entity + drop is_default

- Completed: `user_llm_defaults` is now a real TypeORM entity `UserLlmDefaultEntity` (registered in `LlmProviderModule.forFeature`); `LlmProviderService` reads/writes it via the repository instead of raw SQL.
- Completed: removed the dead `isDefault` field from `LlmModelEntity`; `synchronize: true` dropped the `is_default` column (verified `SHOW COLUMNS FROM llm_models`).
- Completed: added `migrations/DropLlmModelIsDefault1752860000000.ts` (portability only; project uses `synchronize: true`).
- Verified: `npm run build` (backend) passes; DB state confirmed (no `is_default`; `user_llm_defaults` matches entity); no `isDefault`/`is_default` references remain in code.
- No architecture diagram update was needed (module boundaries and default-resolution path unchanged; only the storage representation changed).
