# Documentation Change Log

## 2026-09-17 — Token search: one shared helper, one PrimeNG match mode
- **Decision — search semantics belong in one pure helper (`core/utils/text-search.ts`), not in each component:** eight search surfaces had grown their own `value.toLowerCase().includes(query)`; the sync-models dialog had already evolved the better rule (whitespace tokens, normalization). Extracting `normalizeSearchToken` / `tokenizeSearchQuery` / `matchesSearch` / `filterBySearch` gives every field identical behavior and a single place to test. Tradeoff accepted: the token rule is now also the *default* for filters that only needed a substring (chat titles, strain search) — a strict superset in practice, since it still matches any contiguous query.
- **Decision — teach PrimeNG the rule via `FilterService.register` + a custom match mode, instead of replacing `p-table`'s global filter with a manual computed `[value]`:** `filterGlobal(value, 'tokenContains')` keeps sorting, pagination, `hasFilter()` state and `clearGlobalFilter` working for free. Tradeoff accepted: `table._filter()` evaluates the mode per `globalFilterFields` entry and ORs the results, so tokens must co-exist in one field — a manual computed would fix that but would mean owning pagination/sort state for the table.
- **Decision — register the match mode once at bootstrap (`app.config.ts` → `initializeApp`, `FilterService` in the `APP_INITIALIZER` deps), not inside the two components that use it:** a per-component registration makes correctness depend on load order and silently breaks any future table that forgets it. The registration is idempotent (`filters[rule] = fn`).
- **Decision — strain-hunter's `activeFilters` chips keep substring semantics:** they are typed data filters, not a search box; tokenizing `"sour diesel"` there would widen matches beyond what the user typed. Flagged to the user rather than changed.
- **Changed (11 files):** new `core/utils/text-search.ts` + `.spec.ts` (11 specs), `core/config/token-search-filter.ts` + `.spec.ts` (6 specs); edited `app.config.ts`, `chat-history.ts`, `llm-providers-management.ts` (dialog + toolbar), `strain-hunter-settings.ts`, `strain-hunter.ts` (new private `columnText()`; `item['symbols']` — TS4111 with the index-signature row type), `matching-preferences-drawer.ts`, `users-management.ts`.
- **Verification:** full frontend **594/594 (59 files), exit 0**; `npm run build` exit 0 (pre-existing `strain-hunter.css` budget warning only). Committed `b6d8f10` + pushed `main`. No architecture diagram change.

## 2026-09-15 — Chat model picker: declarative CSS replaced the imperative JS submenu flip
- **Decision — a PrimeNG overlay's submenu placement belongs in the global override stylesheet, not in component code:** the working version positioned `p-tiered-menu` submenus with JS (`adjustSubmenus()`: two `setTimeout`s, `getComputedStyle` per submenu, inline `style.top/bottom/maxHeight/overflowY`, wrapped in `NgZone.runOutsideAngular`). The final form is one declarative rule — `top: auto; bottom: 0` for the submenu plus `max-height: 400px; overflow: auto` — driven by `styleClass="chat-model-menu ltr"`. Fewer moving parts, no DOM writes, no zone escape hatch, and it survives re-render. Tradeoff accepted: the flip is now unconditional (the JS version only flipped when there was no room below), so a group near the top of the viewport can overflow upward.
- **Decision — keep the new rule nested inside the existing `.p-tieredmenu` block** (project nesting convention); it compiles to the flat `.p-tieredmenu.chat-model-menu .p-tieredmenu-submenu` (verified in `dist/frontend/browser/styles-*.css`).
- **Decision — `400px` is a hardcoded value, deliberately:** no max-height token exists in `_variables.css` and Golden Rule #3 forbids inventing one; the user supplied the number explicitly. Converting to `var(--menu-max-height)` requires adding the token first.
- **Changed (6 files):** `chat.html` (p-select → p-tiered-menu + removed `<!-- Test -->` markers), `chat.ts` (menu items with per-model star + `setDefaultModel` command; removed orphans: `NgZone` import/inject, `@ViewChild('menu')`, dead `setDefaultModel(event, model)`), `chat.spec.ts` (store mock +`setDefaultModel`), `_primeng-overrides.css` (`.ltr` island + submenu rule), `llm-providers-management.html` + `strain-hunter.html` (`[draggable]="true"`).
- **Verification:** full frontend **571/571 (57 files), TEST_EXIT=0**; `ng build` exit 0 (existing `strain-hunter.css` budget warning only); graphify updated. No architecture diagram change.

## 2026-08-27 BO — Comparison dialog cells inert — no main-table filter side effects
- **Decision — a comparison/read-only dialog must not mutate the underlying table's filter state; converting interactive filter `<button>`s to inert `<span>`s (same classes) is the lazy correct fix over adding a separate "read-only mode" flag to the shared cell templates:** the dialog reuses the main table's cell templates verbatim, and those cells are filter pills wired to `applyDataFilter`. Clicking them inside the dialog silently changed the main table's `activeFilters`/`searchQuery` behind the modal — bad UX (dialog should be read-only). A "render mode" parameter on the shared templates would be more flexible but touches every cell; the dialog-local conversion keeps the diff small and the intent explicit.
- **Changed (`strain-hunter.html`, dialog body only):** all `applyDataFilter`-wired cells → inert `<span>`s (NEW tag, growType, characterization badges, genetics/parents, terpenes, country, packageType, market trio); symbols `(click)`/`(keydown.enter)` + `role="button"` removed. Kept: `toggleCompare` (comparison membership is dialog-scoped), `openImageDialog` (view-only), tooltips (informative), footer `נקה הכל`.
- **Verification:** full frontend 516/516 (57 files); `npx ng build` exit 0 (existing budget warning only). No architecture diagram change.

## 2026-08-27 BM — Scroll-to-top button on Strain Hunter
- **Decision — the app's scroll container is the layout `.content-shell`, not the window, so the scroll listener must target the component's scrollable ancestor rather than `window`:** `page-content` is not scrollable; `.content-shell` (an ancestor) is. `ngAfterViewInit` walks up from `hostContainer` to the first ancestor with `scrollHeight > clientHeight` and attaches a passive `scroll` listener there, removed via `DestroyRef` (no `OnDestroy` interface churn). Fixed-to-viewport button is correct because the scroll is in an inner container, not the window.
- **Changed (3 files + spec):** `strain-hunter.html` — `.scroll-top-btn` gated by `@if (showScrollTop())`; `strain-hunter.ts` — signal + `ngAfterViewInit` + `scrollToTop()` (smooth); `strain-hunter.css` — fixed bottom-start (bottom-left in RTL), `z-index: 40` (below modals/toasts ~1200), `--shadow-soft`. Spec +1 renders-test.
- **Verification:** targeted 63/63; full frontend 516/516 (57 files); `npx ng build` exit 0 (existing budget warning now 8.86KB). No architecture diagram change.

## 2026-08-27 BN — Compare button to start of action row, search to end
- **Decision — position in a flex row is set by DOM order; RTL start/end = visual left/right placement, so reordering the template is the whole change, no CSS:** `.action-row` is `display: flex` (no `order` overrides), so "start" (right in RTL) = first DOM child, "end" (left) = last. Moved the conditional compare button to first position and the search field to last.
- **Changed (1 file, `strain-hunter.html`):** `.action-row` child order — השוואת זנים → נקה מסננים → הצג מסננים → רענן → התאמה אישית → חיפוש. No TS/CSS change.
- **Verification:** targeted 62/62; `npx ng build` exit 0 (existing budget warning only). No architecture diagram change.

## 2026-08-27 BO — Comparison table showed all strains; dialog p-table was wired to the main-table bindings
- **Decision — a dialog `p-table` that duplicates the main table must ALSO duplicate the data source and the sort handler, not just the chrome:** the rebuilt comparison dialog copied the main table's structure (same `sortable-column-header`, same cell templates) but left three bindings pointing at the main table — `#table` (so `compareTable()` viewChild was undefined and reset no-opped), `[value]="items()"` (the full filtered view, not the selection), and `(sortFunction)="sortTable"`. The user-visible symptom: the comparison dialog rendered every strain instead of only the selected ones.
- **Fix (1 file, `strain-hunter.html`):** the dialog `p-table` now uses `#compareTable`, `[value]="compareItems()"` (the computed that resolves only `compareIds` from `rawItems`), and `(sortFunction)="sortCompareTable($event)"`. The TS side (`compareItems`, `sortCompareTable`, `restoreCompareOrder`) was already written for the comparison table and needed no change — it was just never connected.
- **Verification:** targeted 62/62; full frontend 515/515 (57 files); `npx ng build` exit 0; `git diff --check` clean. No architecture diagram change — component-local wiring fix.

## 2026-08-26 BM — Comparison table rebuilt as a real p-table (no custom CSS)
- **Decision:** a comparison dialog must reuse the main table's own `p-table` + its cell templates verbatim, not re-implement table chrome (headers, borders, sticky cells, row hover) in component/global CSS. Any per-feature CSS that duplicates the datatable's styling is a bug farm and drives the component over budget.
- **Changed:** the comparison `<table class="comparison-table">` was replaced by a `p-table` identical to the main table (same `glass-effect card table-container`, `sortable-column-header`, body cell templates, `table-empty-state`). All `comparison-*` CSS and `app-strain-hunter .compare-toggle-btn` deleted from `_primeng-overrides.css` (file back to HEAD); `.sortable-column-header` moved back inside `.p-datatable-thead`.
- **Added:** generic `.icon-circle-toggle` in `_buttons.css` (compare pill, renamed from `compare-toggle-btn`).
- **Sorting:** `sortCompareTable(SortEvent)` customSort (asc→desc→reset) replaced hand-rolled `sortedCompareItems`/`sortComparison`/`comparisonSortOrder`; `restoreCompareOrder` re-sorts to selection order on reset because customSort mutates `compareItems()` in place.
- **Verification:** targeted 62/62; full frontend 515/515 (57 files); `npx ng build` exit 0; `git diff --check` clean; graphify updated. No architecture diagram change.

**Follow-up (visual parity):** score-ring gradients missing in the comparison table — PrimeNG projects the dialog to `body`, so the `url(#ringGradientSuccess)` reference inside the scoped `.match-ring.ring-success .ring-fill` rule couldn't reliably resolve the component-root `<defs>`. Copied the same `<svg class="gradient-defs-svg">` (4 linearGradients) inside the comparison `<p-dialog>` so the IDs are available in the projected DOM. Strokes now match the main table.


## 2026-08-26 BM — Comparison CSS deduplication
- **Decision:** reuse existing global row/button patterns instead of maintaining one-off equivalents in the comparison overlay.
- **Changed:** comparison strain row now uses `user-profile`, `row-title`, `row-label`, `row-label--bold`, `row-subtitle`, and `transparent-btn warning-btn`; duplicate name/group/remove CSS was removed.
- **Preserved:** existing `sortable-column-header` and `p-sort-icon` styling was left untouched per user request.
- **Verification:** targeted 62/62; full frontend 515/515; `npx ng build` exit 0; `git diff --check` clean; graphify updated. No architecture diagram change.


## 2026-08-26 BM — Comparison strain info spacing
- **Fix:** grouped comparison image and copy in `.comparison-strain-main`; added `justify-content: space-between` to `.comparison-strain-info` so remove action stays separated.
- **Verification:** `npx ng build` exit 0; `git diff --check` clean; graphify updated. No architecture diagram change.


## 2026-08-26 BM — Comparison table sorting
- **Fix:** added accessible sortable headers using the existing `sortable-column-header` class; no new dependency or API.
- **Behavior:** each property cycles ascending → descending → reset; selected strain order returns after reset. Main Strain Hunter table sort remains independent.
- **UI:** caret direction indicates active order; inactive headers show neutral sort icon; `aria-sort` and visible focus state support keyboard users.
- **Verification:** targeted strain-hunter 62/62; full frontend 515/515; `npx ng build` exit 0; `git diff --check` clean; graphify updated. Existing local CSS budget warning remains. No architecture diagram change.


## 2026-08-26 BM — Strain Hunter comparison dialog visual polish
- **Fix — target PrimeNG overlay via `styleClass`, not host `class`:** the initial `class="comparison-dialog"` did not reliably style the generated dialog panel. `styleClass` targets the actual overlay root, allowing RTL and opaque-surface rules to apply.
- **Fix — explicit RTL chrome:** header title aligned right, close control positioned left, footer uses RTL start alignment on the right. The redundant bottom `סגור` action was then removed per user request; top X is sole close control, while `נקה הכל` remains outlined.
- **Fix — legibility:** modal mask darkened and blurred; dialog/content surfaces are opaque, preventing page text from bleeding through.
- **Decision — overlay CSS belongs in `_primeng-overrides.css`:** PrimeNG renders dialogs outside component DOM; global override is correct and lowered local component CSS from 13.36KB to 9.44KB.
- **Follow-up — reduce visual noise:** removed `comparison-dialog-summary`; dialog now opens directly on comparison table. Translated `rating` label to `רייטינג`; moved `enName` below the Hebrew name and removed standalone English-name column; centered compare-toggle icon with `justify-content: center`; added explicit `:first-child` RTL boundary for sticky `זן`/`התאמה`.
- **Verification:** targeted 61/61; full frontend 514/514; `npx ng build` exit 0; no architecture diagram change.

## 2026-08-26 BL — Strain Hunter comparison dialog
- **Decision — keep comparison state local and unbounded:** `compareIds` is a component signal, not persisted; selection survives filtering/search during the session but resets on page recreation. No backend/API change needed.
- **Decision — use a transposed table:** selected strains are rows and properties are columns, matching the user's requested scan direction. The strain-name column stays sticky while the table scrolls horizontally for any number of selected strains/fields.
- **Decision — resolve from `rawItems()`, not filtered `items()`:** changing filters must not silently remove a strain from an already-selected comparison.
- **Verification:** targeted strain-hunter specs 61/61; full frontend 514/514 (57 files); `npx ng build` exit 0. No architecture diagram change — component-local UI state only.

## 2026-08-26 BK — Agent tool 401 loop: internal token cache outlived the JWT (5m cache/10m TTL mismatch)
- **Decision — the cache TTL must be strictly below the JWT expiry, never equal or above:** `AgentToolExecutorService.getInternalToken` cached signed JWTs per-user with `INTERNAL_TOKEN_TTL_MS = 10 * 60 * 1000` while `jwtService.sign` used `expiresIn: '5m'`. Between minute 5 and 10 the cache handed out an already-expired JWT → every agent tool call 401'd (`Request failed with status code 401`) → the LLM retried the same tool 3× → AgentLoopBreaker killed the turn. The failure is time-dependent, which made it look random: the first 5 minutes of a session's tool activity always worked.
- **Fix:** `INTERNAL_TOKEN_TTL_MS = 4 * 60 * 1000` — a 1-minute safety margin below the 5m JWT, with a comment stating the invariant so the two values can't drift apart silently again. Re-sign cost is negligible (one JWT per 4 min per user).
- **Regression test:** `agent-tool-executor.service.h4.spec.ts` — fake timers: cached token reused at +1m, re-signed at +6m (the exact window that 401'd live).
- **Verification:** backend 458→**459** (`npx jest --runInBand`). No architecture-diagram change (internal cache constant).

## 2026-08-20 BK — Error-state UI unified app-wide: PageStates.Error mirrors page-empty-state (stagger + retry)
- **Decision — one global rule over a new variant:** the open question from the backlog ("restyle global `.page-state.error-state` vs add a chrome-less sibling variant") was resolved in favor of the GLOBAL rule, because the user asked to check the state across the whole app — 9 error blocks in 8 files. `_utilities.css`: `.page-state.error-state` (nested, same pattern as `.table-empty-state`) strips the glass card (`background/border/radius: none`) + `animation: none`, icon → primary color. The templates add `stagger stagger-up`, so the reveal matches `.page-empty-state` exactly (children stagger in, container has no card chrome).
- **Found + fixed (pre-existing a11y gap, directly triggered by this work):** `.stagger > *` starts children at `opacity: 0`; under `prefers-reduced-motion` the animation is off, so ALL stagger children (incl. the 4 existing empty states) stayed INVISIBLE. `_animations.css` now forces `animation: none; opacity: 1` on `.stagger > *` inside the reduced-motion media query. Rule: any entrance animation that hides children must have a visible reduced-motion fallback.
- **Decision — retry button is part of the error state contract:** every error block must offer recovery, not just text. Unified all 9 blocks to `primary-btn sm` + "נסה שוב" (llm-providers English page: "Try again"), replacing the mixed `רענן`/filled/outlined variants and ADDING the 4 missing buttons: dashboard + users → `usersStore.reload()`, llm-providers → `llmProviderStore.reload()`, ideas-page session-level → new `loadSessionIdeas()` in ideas-page.ts. The extraction was required: `setViewMode(mode)` early-returns when the mode is unchanged, so a retry button could not call it directly — retry now re-runs the load through the extracted protected method (no duplicated logic).
- **Verification:** baseline 502/502 → after 502/502 (`npx ng test --watch=false`), `npx ng build` exit 0 (only pre-existing strain-hunter.css budget warning), mojibake clean. No architecture diagram change — pure presentation, no module/request-flow impact.

## 2026-08-20 BG — Bridge thread rejected by Freebuff premium-slot limit → model switch + /reset & /status (bridge, outside repo)
- **Architectural finding — Freebuff enforces ONE tab per premium model at a time, and the rejection is silent from Telegram's side:** the bridge's thread (model deepseek/deepseek-v4-flash) collided with the active TUI session on the SAME model. Freebuff did not queue or error visibly — it wrote a `freebuff-slot-taken` notice into the thread ("Another tab is using a premium model…") and produced NO assistant row, so the bridge's waitForReply burned its full 5-minute timeout and reported "לא קיבלתי תשובה". The thread's turn_state was idle + outcome error — not stuck, rejected. Rule: a bridge that shares a model with an interactive session needs a model that cannot collide, or it fails only when the interactive session is active — the worst timing.
- **Decision — the bridge's model must be non-premium AND outside the interactive session's model set:** switched `CONFIG.model` to `mimo/mimo-v2.5` (the only other model in thread history). This also removes the daily-limit class of failures (deepseek/deepseek-v4-flash had BOTH a premium-slot limit and a daily quota — two independent reasons it was the wrong model for a background bridge). Caveat recorded: the Freebuff UI tags mimo "Unlimited/Balanced" but the deepseek rejection message called the same tier "premium" — the UI tag is not a guarantee; the empirical proof is the concurrency test (below). Speed is a watch item (original code comment: "fast model — the default is too slow"); if mimo is too slow, pick another non-premium model and re-test.
- **Decision — control-plane commands on the relay bridge must exist, not be dropped:** previously EVERY `/`-prefixed message was silently discarded (`if (trimmed.startsWith('/')) continue`) — the user's `/reset` was never delivered. Added **`/reset`** (clears state.threadId → next message creates a fresh thread via the existing ensureThread path; sends an ack) and **`/status`** (model + thread id + active/none). Same lesson as the relay-drop of menu commands: a channel that drops a message class must own its own control surface.
- **Verification — direct orchestrator probe, not a Telegram round-trip:** sent a message to the bridge thread via the orchestrator API while this session was active on deepseek → REAL reply "עובד 🟢" in ~6s (seq 558) vs slot-taken at 13:34 pre-fix. Thread: idle/completed on mimo. Bridge restarted (PID 11628), `bun build` syntax-checked. Remaining end-to-end check: a real message from the user's phone.
- **No architecture diagram change** — bridge/telegram tooling outside the repo; no backend/frontend module change.

## 2026-08-20 BJ — Why "2/3 tabs" shows on BOTH unlimited models + the real limited-tier rule (bridge diagnosis)
- **Finding — Freebuff counts tab usage per BUCKET, not per model:** `desktopSessionBucketUsage` filters `session.activeSessionsByThread` by `getFreebuffDesktopSessionBucket(model, tier) === bucket` — all unlimited models (flash + mimo) share ONE bucket with `FREEBUFF_DESKTOP_SESSION_LIMITS.unlimited = 3`. The user has 2 open unlimited threads (their tab on flash + the bridge thread on mimo) → every unlimited model card shows "2/3 tabs in use". Not "two tabs on one model" — two tabs on one shared pool.
- **Finding — the REAL limited-tier rule (refines the earlier "premium slot" explanation):** when `accessTier === 'limited'`: (1) `limit` of the unlimited bucket is hardcoded 0 (`tier === 'limited' && bucket === 'unlimited' ? 0 : LIMITS[bucket]`), and (2) the ONLY allowed models are `LIMITED_FREEBUFF_MODEL_IDS = [mimo/mimo-v2.5]` (`getFreebuffModelsForAccessTier('limited')` returns only mimo). This is exactly why the 14:14 switch to flash got `freebuff-slot-taken` (flash is not even in the limited allowed set) while mimo always worked — mimo is the recommended fallback in `getRecommendedFreefbModelId('limited')`. Rule: mimo is the ONLY model guaranteed to work in BOTH tiers; all others are full-tier-only and can be blocked the moment the premium quota is exhausted.
- **Implication for the bridge — mimo stays the safe default, not just "a non-premium pick":** the /model command works, but choosing flash/pro/luna/minimax reproduces the block whenever the account is in limited tier (daily quota spent). Documented, not coded — switching models remains a user choice with the warning already in /model.
- **Historical check (user: "yesterday this didn't happen") — the trigger is the QUOTA, not tab count:** yesterday (19.8) there were ZERO slot-taken notices despite the user's tab AND the bridge thread BOTH being on flash (thread 3c673501 created 17:33 on flash, replies all evening) — two tabs on the same model coexisted fine because the account was full-tier. Today the first "Daily limit reached" appeared at 11:21 (bridge thread), the tier dropped to limited, and only THEN did slot-taken start (13:07+). Rule refined: two tabs on the same model are harmless in full tier; the block is the limited-tier consequence of the daily premium quota being spent. So the earlier "one tab per premium model" framing was incomplete — it is really "one tab per model in LIMITED tier; unlimited slots in full tier".
- **No architecture diagram change** — bridge tooling outside the repo.

## 2026-08-20 BI — /model command: dynamic model switch via Telegram (bridge, outside repo)
- **Decision — a fixed known list beats free text:** the user could mistype a model id and get a silent failure. `KNOWN_MODELS` is a hard-coded allowlist, VERIFIED against the Freebuff orchestrator source (SUPPORTED_FREEBUFF_MODELS, FREEBUFF_MODELS, premium flags, FREEBUFF_DESKTOP_PREMIUM_BUCKET_MODEL_IDS) — not recalled from the conversation. Tiers are the orchestrator's own: mimo/mimo-v2.5 + deepseek/deepseek-v4-flash = unlimited; deepseek/deepseek-v4-pro, openai/gpt-5.6-luna, minimax/minimax-m3 = premium.
- **Finding — the earlier slot-taken on "unlimited" flash is explained by accessTier, not the model:** `occupiesFreebuffDesktopSlot = accessTier === 'limited' || premiumBucketModel`. Under a limited tier EVERY model occupies a slot (all become premium-bucket); the desktop premium bucket list is only [MiniMax M3, V4 Pro, GPT-5.6 Luna, GLM 5.2]. So the /model reply warns for premium models AND notes the limited-tier caveat for unlimited ones.
- **Decision — persist the choice and enforce immediately:** `state.model` in state.json overrides the hardcoded default on boot (verified: `loaded persisted model` in the log after restart). Enforcement goes through the same `/api/thread/:id/agent` call ensureThread uses, fired IMMEDIATELY on /model — not deferred to the next message. Live check: the orchestrator returns `{ok:true, model, rejected:true}` when the premium slot (limit 1) is taken — the bridge surfaces that honestly instead of claiming success.
- **Bug caught by live testing — unescaped angle brackets 400 the send:** the no-arg list ended with `שלח /model <שם>`; Telegram HTML parsing rejected it (`can't parse entities: Unsupported start tag "שם"`). Fixed with the same esc() convention (→ `&lt;שם&gt;`). Rule re-confirmed: EVERY dynamic string in an HTML-parse_mode send goes through esc(); only deliberate <b> tags stay raw.
- **No architecture diagram change** — bridge tooling outside the repo.

## 2026-08-20 BH — /status upgraded to model/ctx/branch with bold keys (bridge, outside repo)
- **Data-source verification before implementation — never invent a number:** the reviewer's two unknowns were checked empirically, not assumed. (1) **ctx% — NOT in the thread API:** `GET /api/thread/:id` returns no usage/context field (full dump checked). The real source is the SQLite `messages.metrics_json.context`: `usedTokens / compactionThresholdTokens` of the LAST message (41937/400000 → 10%). If the thread has no metrics, /status prints "לא זמין" — it never fabricates. (2) **branch — works, but only with `shell: 'bash'`:** `git rev-parse --abbrev-ref HEAD` with `cwd: PROJECT_PATH` fails under the default Windows shell (cmd.exe spawn fails); `shell: 'bash'` returns `main`. Verified from the bridge's runtime (bun) before writing the code.
- **Decision — HTML formatting only where control is local:** /status builds `parse_mode: 'HTML'` with `<b>` on the keys and `esc()` (same escape as backend telegram-notify.service.ts) on values. The generic `sendReply` stays plain-text — agent replies may contain unescaped `<`/`&`, and HTML-parse_mode-ing them risks a 400. Rule: use the project's proven escaping convention, don't invent a second mechanism; scope HTML to the message that fully controls its content.
- **No architecture diagram change** — bridge tooling outside the repo.

## 2026-08-20 BF — TELEGRAM_COMMAND_BOT_TOKEN rotation (exposed token revoked + command bot restarted)
- **Incident — a live bot token was pasted in plaintext into the Telegram chat (16:46):** `8819803995:...` (FreeBuzCommandBot's `TELEGRAM_COMMAND_BOT_TOKEN`) was pasted as a chat message during the command-bot setup work; it sat in the bridge DB (`desktop-v2.db`) + log in cleartext for hours. Verified it was a REAL, LIVE token (`getMe` → ok:true) before revoking — a live exposed token must be rotated, not ignored (the low-risk personal-bot framing does not change that).
- **False alarm correctly defused — the relay was NOT dead:** `bridge.log` showed `Unauthorized` ×8 from 19:58, which looked like the relay token died. Evidence: `getMe` on the CURRENT `TELEGRAM_BOT_TOKEN` → ok:true; `bridge.lock` PID alive; `state.json` mtime = today (written after every successful poll) — the bridge was polling fine. The `Unauthorized` was a transient window (token fixed in `.env` at 22:59, bridge restarted 23:12 — the stale `bridge.log` just doesn't reflect the newer process). The two tokens are deliberately separate: relay (`TELEGRAM_BOT_TOKEN`, @freebuzbot) untouched; only the command bot's token was exposed.
- **Operational decision — rotate, don't wait:** reviewer approved immediate rotation. Order followed: (1) user revoked the OLD token in BotFather; (2) user wrote the NEW token to `backend/.env`; (3) I restarted the command bot (kill PID 35112 → `node scripts/telegram-command-bot.js` from `~/.freebuff-bridge`, same interpreter/path, log → `C:/tmp/command-bot.log`). Not the reverse order — no window where two tokens are simultaneously "live".
- **Verification protocol (all green):** NEW token `getMe` → ok:true · OLD (revoked) token `getMe` → **401** (the proof the revoke took) · `getUpdates` with new token → ok · poller alive (PID 32880) with zero errors after the one-time 409 (the 409 at 10:26:45 was the restart overlapping the OLD process's still-registered long-poll — a restart artifact, self-resolved) · `--test status` executed the real handler with the new token (REPLY: :3000 listener PID 43868 correct) · live test message sent through FreeBuzCommandBot (`message_id: 28`) · no duplicate instance remains (only ONE polling process).
- **Post-rotation residue (known, not urgent):** the old token remains in the DB/chat history in cleartext — it's dead (401), but don't share logs/DB externally without remembering it's there.
- **Open question (from reviewer, non-blocking):** who/what fixed `.env` at 22:59 that ended the `Unauthorized`? If it was a prior session's manual edit — closed. If it happened "by itself" — worth 10s of thought about an uncontrolled `.env` writer. (Not resolved — flagging.)
- **No architecture diagram change** — external token rotation, no code change.

## 2026-08-20 BE — Translation-harvest tracker: map misses become a visible nightly work queue
- **Architectural decision — a passive debug log is unimplemented; a work queue must deliver itself:** the user asked who updates `HEBREW_STRAIN_NAMES` when a new strain enters with genetics not in the map (answer: nobody — manual edits only). The reviewer rejected the naive debug-log option (a log nobody scans is A that only LOOKS implemented) and approved A-with-extensions: record misses into an in-memory tracker and append a block to the EXISTING nightly Telegram push — the message is the work queue, seen without searching. Same spirit as the empty-run notification: the invariant is "relevant state reaches the user's phone by default".
- **Decision — in-memory singleton, not a NestJS provider, not a DB table:** the tracker is a module-level singleton (one backend process) imported directly by genetics/terpene/ideas modules — no cross-module DI wiring for a counter. Deduped by Hebrew name (latest wins, capped 200), so the count = DISTINCT new strains, not translation calls (batch flows translate once per chunk anyway). Honest label: "מאז אתחול" (since process start) — true monthly persistence is the B decision and, per the reviewer, must be a DB table (consistent with `GoogleCalendarTokenEntity`), never a JSON file — the OAuth "state in the wrong storage" lesson.
- **Decision — the tracker block lives INSIDE the 4000-char cap, not appended after it:** `buildTranslationTrackerSection()` is called inside `buildNightlyIdeasMessage` before the cap logic, so the block can never push the message past Telegram's 4096 limit (a post-cap append could). Empty tracker → '' → quiet nights keep the summary byte-identical.
- **Decision — terpenes get full instrumentation, not just genetics:** terpenes have NO hardcoded map at all (100% LLM), so "misses" don't exist there — every LLM translation is recorded instead, building the seed data for a future terpene map (which names actually flow through the LLM).
- **No architecture diagram change** — internal tracking singleton + message content; the Telegram provider edge already exists in the diagram.

## 2026-08-19 BD — gemma approved as the nightly default (user: "gemma עכשיו") — quality gate passed, live-verified end-to-end
- **Process decision — the quality gate closed exactly as designed:** the user's protocol (test first, read the content, only then switch the default) ran its course: gemma was manually tested (session 95: 4 ideas, ~2 min), content read and assessed as good, and only THEN did the user approve. The switch happened as its own concern — the model choice stays isolated in `.env` and will be its own commit when we commit, per the user's requirement.
- **Decision — an approved default needs a live proof, not just a config edit:** after flipping `IDEAS_NIGHTLY_MODEL` to `openrouter/google/gemma-4-31b-it:free`, a real nightly run was triggered and watched to completion. Result: 3 grounded sessions (96-98) × 15 ideas in ~9 min — the log shows every LLM call on gemma, zero empty-content rejections (glm's documented failure mode). Topics: COPPA/GDPR for kids products (Shopify), Amazon FBA net-profit calculator, Etsy image-license manager — coherent niches, scores 3-7/10.
- **Honest limit — 3 of 5 target sessions:** the run accepted 3 of the 5-target; grounding rate is still search-quality-bound (SearXNG noise — a known limit, documented since A2/A4), NOT a model problem. glm produced 0; gemma produced 15 grounded ideas. Progress, not perfection.
- **Operational note — the DB is MySQL, not Postgres:** `mysql2/promise` via `DB_*` env (no `DATABASE_URL`); tables are `saved_idea_sessions` / `saved_ideas`.
- **No architecture diagram change** — model choice is env config; the pipeline is unchanged.

## 2026-08-19 BC — Telegram formatting: HTML parse_mode everywhere (bold renders, escaping centralized)
- **Architectural decision — formatting is a transport property, and the transport chose HTML over MarkdownV2:** sendMessage without parse_mode sends literal text, so `**` rendered as asterisks (user: annoying). MarkdownV2 was rejected because it requires escaping most Hebrew punctuation (`.` `,` `!` `?` `(` `)` …) — a single unescaped char makes Telegram reject the whole send with 400. HTML parse_mode needs only `& < >` escaped, and that escaping is now centralized in exactly two places: `esc()` (backend, applied to LLM content in the nightly builder) and `toHtml()` (responder + session helper `scripts/tg-html-send.js`, applied to everything with `{{b}}…{{/b}}` as the bold marker). Rule: escaping belongs at the message boundary, not in each message.
- **Decision — bold only on known-safe segments:** the nightly builder wraps counts and topic names in `<b>` and escapes ALL LLM-supplied text (domain/title/description can legally contain `<` and `&` — the 400-waiting-to-happen). The responder/helper escape everything by default so dynamic command output (git/jest/netstat) can never break a send.
- **Operational note:** this change is LIVE — backend :3000 restarted with the new dist (parse_mode in the payload), responder restarted, and a live test message (bold + `5 & 6 < 7 > 4`) was sent and confirmed.
- **No architecture diagram change** — message formatting inside existing send paths.

## 2026-08-19 BB — Standalone command bot: relay drops "/"-commands → commands execute outside Freebuff
- **Architectural decision — when a relay silently drops a message class, own the channel instead of fighting the relay:** the Freebuff relay consumed the menu-command messages but never delivered them to the session (empirically isolated: sent from Telegram, never arrived — the "3" answer in the isolation test). The orchestrator is hard-coded and unmodifiable; the achievable architecture is a SEPARATE bot (`FreeBuzCommandBot`) that long-polls its own updates and executes commands itself — the session/relay is entirely out of the loop, including the 5-minute no-reply monitor. Rule: a broken bridge leg is replaced by an independent responder, not patched around.
- **Decision — backgrounding inside exec() is a hang, not a style choice:** `exec('(cmd &)')` gave the backgrounded child the exec stdio pipes; the child kept them open, so the exec callback never fired and /restart_backend hung indefinitely (hit live: the backend DID restart, the command never returned — killed the stuck process and re-verified). Detached spawn (`spawn('bash', ['-c', cmd], {detached: true, stdio: 'ignore'})` + `unref()`) is the only safe way to launch the :3000 instance from inside the responder.
- **Decision — /stop must not go through the normal dispatch:** routing it through executeCommand overwrote the running command's busy state, so the reply said "stopped /stop" instead of "/tests". Stop is a control-plane operation that READS the worker's state — it bypasses dispatch and calls the handler directly.
- **Decision — exit codes through pipes lie:** `npx jest ... | tail` makes the pipeline exit code tail's (always 0). Capture `echo EXIT=$?` right after the command, before the pipe, and parse it — the same mistake class as PIPESTATUS.
- **Operational note — user must Start the new bot:** a bot cannot sendMessage to a chat it has never been started in (HTTP 400 on the ack attempt). Registration (setMyCommands / menu button) works regardless; the first user message unlocks delivery.
- **Follow-up (user: "אז צריך לשנות את התפריט פה") — a menu that cannot work must not exist:** the relay bot's commands menu was cleared (`setMyCommands []` + `setChatMenuButton default`) because every command there is dead — the relay drops "/"-messages. Verified on the user's chat (661157823): menu button = default (hidden), commands = []. ⚠️ Telegram quirk hit: `getChatMenuButton()` without chat_id kept returning `{type: commands}` after 4 ok:true sets (python + curl, bare/chat_id/scope-default) — the per-chat readback (the only one the user sees) is correct; a client-side chat reopen may be needed to drop a cached button.
- **No architecture diagram change** — standalone tooling script; no backend/frontend module or flow change in agentic-admin.

## 2026-08-19 BA — Telegram slash commands for the bridge bot (menu + commands button)
- **Architectural decision — bridge commands are a BOT-side concern + in-session execution, not orchestrator code:** the Freebuff orchestrator is a compiled, hard-coded client (cannot be modified from this repo — documented). The achievable split: (1) `setMyCommands` + `setChatMenuButton {type:commands}` via the Bot API (persisted, idempotent script `scripts/telegram-bot-commands.js`, token from `backend/.env`); (2) command HANDLING in-session — the commands arrive as relayed messages and the agent executes them, replying via `sendMessage`.
- **Decision — command list follows reality, not aspiration:** `/approve` was dropped because NO pending-approval flow exists for this bridge (the agentic-admin CONFIRMATION_REQUIRED flow lives in its own web chat, not the Telegram bridge) — a command that cannot act is a lie in the menu. `/help` added. Suggested `/nightly` (backend trigger + report) as a future option.
- **Behavior contract (user-driven, addresses the earlier "stuck" complaint):** every command replies immediately ("מתחיל…"), slow ops (/tests, /build) send interim updates, failures send clear error messages — never silence. The 5-minute "no reply" warning the user saw was the client's monitor while the agent was mid-task; the contract prevents the perceived stuck state.
- **Verified empirically:** API readback (getMyCommands/getChatMenuButton) + actual runs of /status /git /tests (backend 436/436, frontend 502/502) /build (exit 0) /restart_backend (PID 1080). /stop: semantics documented; a real stop test requires a deliberately-running long task (the hard abort is the client Stop button) — not faked.
- **No architecture diagram change** — bot-API config + agent behavior; no module/flow change in agentic-admin.

## 2026-08-19 AZ — Quality gate for the nightly idea-generation model (user protocol)
- **Process decision — a model that generates content needs a quality gate, not just a reliability fix:** switching `IDEAS_NIGHTLY_MODEL` changes what the user reads every morning — it is a content-quality decision. The user's protocol (adopted): (1) ONE manual trigger with the candidate model on the same domains/params; (2) read 2-3 ideas for CONTENT quality, not just "didn't crash"; (3) only then flip the default, in a SEPARATE commit. Also: "stable ≠ good content" — documented gemma quality issues exist in another context (Cannlytics name translation) and must not be assumed irrelevant to idea generation.
- **Test outcome (session 95, gemma-4-31b-it:free):** 1 grounded session / 4 ideas in ~2 min (vs glm-4.7-flash: 22 min + 0 grounded, empty-content). Ideas: coherent GDPR/compliance niche, natural Hebrew, concrete ChatGPT/Zapier differentiation, honest validation caveats; same-pattern saturation within the domain; 1/5 grounding rate (SearXNG noise — search-quality limit, not the model). Verdict: good — recommended for default, user's final call.
- **State after the test:** default REVERTED to glm in `.env`; gemma kept as a commented manual-test option; :3000 restarted on glm + empty-run notification. When approved: switch default in a separate commit, restart, re-verify.
- **No architecture diagram change** — model choice is config; the Telegram provider edge already exists.

## 2026-08-19 AY — Empty-run notification + nightly model → gemma (dead-pipeline visibility)
- **Architectural decision — a finished-but-empty run must not be silent:** a trigger that ends with 0 grounded ideas looks identical to a trigger that never ran. The empty-run branch now pushes a Telegram message ("הריצה נגמרה בלי רעיונות grounded") when the bot is enabled — the invariant is "every trigger answers", success AND emptiness alike. (The user's exact edge-case class again: the case nobody thought of — the feature was correct, but a 0-grounded outcome had no observer.)
- **Operational finding — the nightly model was the failure all along:** the live run (18:21:37→18:43:35) produced 0/5 grounded; glm-4.7-flash (cloude-flare) emitted `"Returned no content or tool calls from AI model"` ×3 in validation — the documented thinking-model empty-content pathology (rounds 4-9). Rule reinforced: the empty-content class of failure is a MODEL property, not a pipeline bug — prefer non-thinking models for the nightly chain. NOTE (see AZ): gemma was tested manually and is NOT the default yet — the user's quality gate governs the switch.
- **Live ops note — restarting the backend from the agent:** `(PORT=3000 node dist/main > log 2>&1 &)` in a subshell launches without hanging the terminal tool; verify separately (netstat + log tail).
- **No architecture diagram change** — notification branch + env config; the Telegram provider edge already exists.

## 2026-08-19 AX — Telegram push hardening: selective retry + explicit failure visibility
- **Architectural decision — retry must be selective, not blanket:** a retry loop that re-sends on `ok:false` (expired token, unknown chat) is pure waste — the failure is terminal and cannot succeed on a retry. Only transient failures (no HTTP response: DNS/network/timeout; or HTTP 5xx) are retried — 3 attempts, fixed backoff 500/1000ms (~1.5s total). Rule: classify failure classes before deciding to retry; the classification IS the feature ("לא retry גורף על הכל").
- **Decision — a run's success and a channel's failure must both survive in the log:** `runNightly` now logs an explicit warn when Telegram is enabled but the push returns false ("succeeded, but the Telegram notification failed"), gated on `isEnabled()` so unconfigured installs stay silent. Otherwise a dead bot would silently degrade into "no notification" with only a scattered warn inside the service.
- **Testing note — fake timers verify the backoff gaps, not just the count:** assertions at t=499/500/1499/1500 prove the retries fire at exactly 500ms and 1000ms; the ok:false and 4xx cases assert exactly ONE call — the no-retry behavior is empirically pinned, not assumed.
- **No architecture diagram change** — internal retry/logging behavior of an existing service (the Telegram provider edge already exists in the diagram).

## 2026-08-19 AW — Nightly ideas → Telegram push (ideas included, not just "ready")
- **Architectural decision — a fire-and-forget long job deserves a one-way completion push, not polling:** the manual nightly trigger returns immediately while the run takes ~7-8 min; earlier sessions deferred poll-until-completion as YAGNI. A Telegram push at run end closes the feedback gap with zero polling and zero new UI. The user asked for the ideas themselves in the message — so the summary carries them (header counts, per-topic ideas sorted by score desc, top 5, 4000-char hard cap), not just "done".
- **Decision — external push channel must never break the source flow:** `TelegramNotifyService.sendMessage` never throws — config missing → warn + false; API rejects → warn + false; network error → catch + false. The nightly cron treats the push as best-effort, exactly like the best-effort `saveGeneration` persistence.
- **Decision — Hebrew safety via JSON body:** the Bot API `sendMessage` with `Content-Type: application/json` carries Hebrew intact (the documented curl gotcha was form-encoding/URL-encoding in Git Bash). Payload: `{ chat_id, text, disable_web_page_preview }`.
- **Dotfile tooling note:** `str_replace` refuses dotfiles (`.env*`) — python precision edit is the established workaround (same as A11).
- **Architecture diagram UPDATED** — new external provider (Telegram Bot API): module graph edge `IdeasModule → TelegramApi`, nightly sequence step, module-responsibilities block, and a Current-Architecture-Notes bullet.

## 2026-08-19 AV — Single-use contract audit: callback hidden from LLM + triggerNightly EXACTLY-ONCE
- **Architectural decision — one-time external-action tools need a contract AND, where possible, removal from the tool surface:** the OAuth callback is a tool the agent can never legitimately call (browser-redirect target; the agent has no code/state to pass — only Google's redirect does). Describing "never call" is belt-and-suspenders for the spec; hiding it in `HIDDEN_FROM_LLM` (alongside confirmAction/streamChat) removes the temptation and the loop risk entirely. Rule for future work: any endpoint whose only legitimate caller is a human or an external provider (redirect targets, human-only confirmations, recursion endpoints) belongs in `HIDDEN_FROM_LLM`, not in a description.
- **Decision — classification for the "call EXACTLY ONCE, present, stop" contract:** strict criterion = one-time action the user must complete externally (OAuth `auth` ✅ already; `callback` ✅ now). Adjacent case also covered: one-time fire-and-forget where re-calling is harmful — `IdeasController_triggerNightly` (each call starts a new ~7.5-min background run; contract says call once, never re-call to check progress, never claim results are ready). Tools whose URL is a *result* (generateImage) or whose polling is by-design (getVideo) get no contract — reviewed, not applicable.
- **Verification note:** swagger-spec.json is committed and read at runtime — description changes require regenerating it (app boot writes it before listen). A transient backend boot during the session regenerated it automatically; git diff confirmed exactly the 2 new description strings.
- **No architecture diagram change** — tool-exposure policy + descriptions inside the existing parser flow; the diagram documents modules, not individual tools.

## 2026-08-19 AU — OAuth flow lifecycle logging (reviewer-requested closure of the auth-loop work)
- **Architectural decision — one-time external-action flows must be diagnosable from the log alone:** the "OAuth state is invalid or expired" incident (session 227) required DB timestamp digging to prove the overwrite sequence. The flow now logs its full lifecycle: `[OAuthAuth]` issued-vs-reused (userId + expiry, never the state value — it is a CSRF secret) and `[OAuthCallback]` success or rejected-with-reason (unknown vs expired). Rule: when a failure is only explainable by reconstructing a call sequence, that sequence must be in the logs by default.
- **Decision — reviewer-endorsed gap, tracked not fixed:** "not a global orchestration bug" is technically correct (breaker + sequential await are sound), but the real exposure is a missing behavioral default — any tool returning a one-time action the user must complete externally (OAuth today; SMS approval / payment / redirect tomorrow) re-enters the same loop until its description carries "call EXACTLY ONCE, present, stop". Follow-up open: audit all tools for this nature and add the explicit single-use contract.
- **No architecture diagram change** — service-level logging + a documented follow-up; module boundaries unchanged.

## 2026-08-19 AO — Confirmation banner: fixed toast + animate in/out (no CLS)
- **Architectural decision — transient confirmations must not move the document:** an in-flow banner pushes content down on appear and up on dismiss (CLS). The banner is now a `position: fixed` top-center toast (`inset-inline: 0; margin-inline: auto; width: fit-content` — logical centering leaves `transform` free for animations). Live-measured: first list row stayed at 164.7px across the full lifecycle (delta 0.03px = sub-pixel) — zero layout shift.
- **Decision — reuse existing keyframes:** enter = `slideDown` (opacity+translate, already global), exit = `fadeOut` via a `bannerClosing` signal (5s → `.closing` → 200ms → removed at 5.3s) — same closing-state pattern as strain-hunter-settings' exit animations. Zero new keyframes, `prefers-reduced-motion` disables.
- **Gotcha — transition tokens are full values, not durations:** `--transition-standard: 200ms cubic-bezier(0.4,0,0.2,1)` — `animation: slideDown var(--transition-standard) ease-out` expands to TWO timing functions → whole shorthand invalid → `animation-name: none` silently (computed style only shows it). Pass the token alone: `animation: slideDown var(--transition-standard)`.
- **Verification note (tooling):** live measurement must re-query the DOM every sample — a captured element reference reads `top: 0` once it's detached (page flickers to Loading during `loadSessions` and the old node is removed). Also: `main .header-actions button` matches the avatar too (app header shares the class) — select by index or by icon, not `closest()`.
- **No architecture diagram change** — component-level UX.

## 2026-08-19 AT — Sidebar sessions lazy: load on first dropdown open (branch sidebar-lazy-loading)
- **Architectural decision — sidebar history data must not load on every page:** `MainSidebar.ngOnInit` fired `chatStore.loadSessions()` + `ideasStore.loadSessions()` on EVERY page load (measured baseline: `/admin-agent/sessions` + `/ideas/sessions` @343ms with zero interaction). Deferred to first dropdown open — same spirit as the lazy settings tabs. Baseline → after: page load fires ONLY `/auth/me`.
- **Structural change required:** both dropdowns were wrapped in `@if (recentSessions().length > 0)` — with lazy loading the trigger button would never render (chicken-and-egg). Restructured: the dropdown trigger is ALWAYS visible; content branches `loading → list → empty state` (`nav-sub-loading` spinner / `nav-sub-empty` text). The shared `Dropdown` component gained an `opened` output (mirrors the existing `closed`) emitted when the trigger actually opens; MainSidebar guards with per-dropdown `loaded` flags → exactly one fetch per dropdown, no refetch on reopen.
- **Verified live (timestamps):** page load → no sessions; hover chat dropdown → `/admin-agent/sessions` @13303 (5 items); reopen → no refetch; hover ideas dropdown → `/ideas/sessions` @33684; reopen → no refetch; navigation /settings→/ideas → zero sessions calls, sidebar intact.
- **No architecture diagram change** — component/store behavior only.

## 2026-08-19 AS — Banner consolidated further by user: `.animated-banner` variant
- **User edit adopted:** the toast mechanics (absolute overlay, top calc, inset, z-index, `.closing`) were moved from the component into the global `.banner` as an `&.animated-banner` variant; `gap` bumped to `space-8` (button breathing room); the `.banner--spread` variant was dropped (fit-content makes justify-content a no-op — agreed, YAGNI). `ideas-history.html` = `glass-effect banner animated-banner`; `ideas-history.css` keeps only `.page-content { position: relative }` + reduced-motion. Live re-verified end-to-end: slideDown → closing+fadeOut → removed, centered in content area, top 99.3.
- **Rule of thumb that emerged:** component-scoped toast mechanics only when a page needs them; the look lives globally. Reduced-motion is covered from both sides (global `.banner`, component `.closing`).
- **No architecture diagram change** — shared CSS pattern.

## 2026-08-19 AR — One global banner class with variants (toast + persistent nightly banner)
- **Architectural decision — a banner is a banner:** the auto-dismiss toast (ideas-history) and the persistent nightly banner (ideas-page) now share ONE global `.banner` in `_utilities.css` — content-sized (`fit-content`), centered (`margin-inline: auto`), capped (`max-width: 100%`), glass surface, `slideDown` enter animation, `prefers-reduced-motion` disable. `.banner--spread` variant (justify-content: space-between; width: 100%) exists for wide banners with trailing actions; the persistent banner currently uses the pill look (user: "look like the toast"). The toast's absolute positioning/top/z-index/closing animation stay component-scoped in ideas-history.css — the shared part is only the look.
- **Gotcha — fit-content kills justify-content:** with `width: fit-content` there is zero free space, so `justify-content: space-between` is a no-op — a "spread" banner must opt into `width: 100%` via the variant.
- **No architecture diagram change** — shared CSS pattern + one class on ideas-page.

## 2026-08-19 AQ — Global fix: page-content grows with content (bottom padding was swallowed)
- **Bug (user report, ideas-history):** the last card was flush with the bottom of the scroll area. Root cause (measured): `.page-content { flex: 1; min-height: 0 }` — the box height = free space of the flex container, NOT its content; long lists overflowed the box, so `padding-bottom: var(--space-8)` sat at the box edge (216.7px) while the list ran to 1100px — the padding never appeared below the last row. Global issue for every non-flush page with overflowing content.
- **Fix (global, `_layout.css`):** `.page-content { flex: 1 0 auto }` — flex-grow still fills the shell on short pages (identical rendering), flex-basis auto lets the box grow with content on long pages so padding-bottom lands at the real bottom. Verified live: ideas-history gap 0 → 16px; users/settings (short) unchanged; `.page-content.flush` (media/ideas composer pages) unaffected — composer still docked at the bottom.
- **No architecture diagram change** — layout CSS only.

## 2026-08-19 AP — Banner positioning: absolute-to-content, not fixed-to-viewport
- **Architectural decision — transient toasts must center in the CONTENT area, not the viewport:** with the RTL sidebar (right 180px), viewport-center (measured 318) ≠ what the user perceives as "page middle" (content center 233.7). A `position: fixed` element can't anchor to the content box in pure CSS. Switched to `position: absolute` inside `.page-content` (`position: relative` scoped) — `inset-inline: 0; margin-inline: auto; width: fit-content` then centers in the content area exactly (delta 0.0 measured). Bonus: the same `top: calc(space-20 + space-4)` lands ~50px lower than the fixed version (content starts below the app header), which is exactly what the user asked for.
- **Trade-off accepted:** absolute scrolls away with the content (fixed stays pinned); fine for a 5s flash triggered at the top of the page.
- **No architecture diagram change** — component-level UX.

## 2026-08-19 AN — triggerSuccess message rendered (ideas-history, second agent's fix, reviewed+verified)
- **Decision — every state the user is told about must be rendered:** `triggerSuccess` was set (5s auto-clear) but never bound in the template — the "התוצאות יופיעו בהיסטוריה לאחר סיום" confirmation was invisible. Fix reuses the existing global `.glass-effect.banner` / `.banner-content` pattern (ideas-page) instead of inventing a new toast/notification system — zero new CSS, zero new deps.
- **Verification note — stale dev-server watcher:** the long-running :4200 ng serve (user's, since 8/18 23:49) stopped serving recompiled templates; restarted fresh (precedent from the lazy-tabs session). Also: a programmatic `button.click()` probe hit the avatar menu instead of the trigger (both sit in a `.header-actions` ancestor) — live verification must use the snapshot uid, not a closest()-based selector.
- **Second-agent workflow (working well):** read HANDOFF/STATUS first, grepped existing patterns before editing, wrote a regression test, updated docs, skipped YAGNI items explicitly, left commit/push to the user. Only miss: LOG.md (project convention) — filled here.
- **No architecture diagram change** — cosmetic template + test only.

## 2026-08-19 AM — Manual nightly trigger must refresh the sessions list (ideas-history)
- **Decision — every mutation path that can create sessions must end with a list refresh:** the SSE generate flow refreshes on `phase:'done'`; the manual `POST /ideas/nightly/trigger` path (fire-and-forget) refreshed only the expanded session, so newly created sessions were invisible until a manual refresh. Rule: after any action that can add a row, refetch the list (with the current filter) before refreshing details.
- **Decision — fire-and-forget trigger ≠ refresh-at-trigger solves it:** the POST returns immediately while the run takes ~7.5 min; refreshing at trigger time confirms the refetch fires but the new session lands only when the run completes + the next natural refetch. Full closure would need poll-until-new-session or a completion signal — flagged to the user, NOT implemented (scope discipline; the requested fix is the refetch).
- **Side-finding — dead UI state:** `triggerSuccess` is set in the component but never rendered in the template — the "התוצאות יופיעו בהיסטוריה לאחר סיום" message is invisible. Separate tiny fix candidate.
- **No architecture diagram change** — component behavior + store action ordering only.

## 2026-08-19 AL — Agent auth loop: tool description + loop-breaker rescue (consent URL must reach the user)
- **Decision — OAuth-style tools need an explicit "call once, present, stop" contract in their tool description:** a tool that returns a URL for the USER to click is not "done" from the model's perspective — without an explicit stop instruction the model re-calls it every iteration and the loop breaker (which was never designed to surface a consent link) eats the result. The tool description is the cheapest prevention; the breaker rescue is the safety net.
- **Decision — loop-breaker failure must not destroy user-actionable artifacts:** the per-tool cap discarded the collected AuthUrl render card + URL, leaving the user with only a Hebrew error. Rescue path: inject the already-obtained URL as a tool message, give the model ONE final no-tools turn to write the link, and attach the collected render blocks to that message (streaming).
- **Bug fixed along the way:** the existing rescue message contained CJK mojibake (`אל ת尝试 שוב` — Chinese "try" inside Hebrew); rewritten to clean Hebrew ("אל תקרא שוב לכלי...").
- **No architecture diagram change** — orchestration behavior + tool description only.

## 2026-08-18 AJ — Settings tabs: lazy + #content template wrappers (empirically verified)
- **Architectural decision — PrimeNG `lazy` tabs need `<ng-template #content>` to actually defer instantiation:** in PrimeNG 22.0.0, `lazy` alone defers only the RENDERING of inactive panels; the projected `ng-content` content is still instantiated eagerly (components' constructors/ngOnInit ran, stores created, HTTP fired — verified live with dataset markers; matches the known behavior behind primeng issue #17351). Wrapping each non-first tab's content in `<ng-template #content>` makes PrimeNG use a TemplateRef (inert until the panel activates) → components + their requests are created ONLY on first tab activation, then stay alive (hasBeenRendered sticky) → no refetch, state preserved. Pattern: `<p-tabs value="0" lazy>` + `<p-tabpanel value="N"><ng-template #content>…</ng-template></p-tabpanel>`.
- **Finding — Angular `httpResource` fires on store creation, not only on read:** GeneticsStore/TerpeneStore (root singletons) issued GET /genetics + /terpenes the moment any component injected them — which is why eager tab panels meant eager fetches.
- **Tooling lesson:** (1) the preview's console capture shows empty `[log]` entries — DOM `data-*` markers are a more reliable observation channel; (2) fetching dev-server `@ng/component` modules with a wrong `t=` returns an empty body (false "stale" readings); (3) a global `PORT` env var overrides `ng serve --port` ("Using port 0") — unset it (`PORT= npx ng serve`) to bind a chosen port; (4) backend CORS allows only `http://localhost:4200` (CORS_ORIGIN env, boot-time).
- **Not committed yet (previous sessions):** backend enrichment + CLS skeleton.
- **No architecture diagram change** — component-level request behavior only; no boundary/flow change.

## 2026-08-19 AK — Google Calendar OAuth state overwrite: idempotent auth + controlled 400
- **Decision — OAuth state must be idempotent per flow, not overwritten per call:** the state is a single per-user DB column (CSRF binding). Overwriting it on every `/calendar/auth` made agent retry loops kill the flow the user already started (empirically reproduced and then regression-tested: auth→auth→callback(first state) completes after the fix). Reuse a still-valid state until used or expired. Race noted (check-then-write) — single-user tool, revisit with row lock only if concurrency ever matters.
- **Decision — external-call failures at trust boundaries return controlled 4xx, never 500:** the Google token exchange throwing produced an unhandled 500, contradicting the swagger contract (400). Wrap and map to BadRequestException.
- **Debugging protocol that worked (repeat it):** reproduce live with the exact failing sequence (curl, cookie jar), add a CONTROL call to prove the failure is specific (S2 valid vs S1 killed — rules out TTL/global causes), and only then touch code. Two-commit split (fix + separate fix) kept the diff reviewable.
- **No architecture diagram change** — service-level behavior.

## 2026-08-18 AJ2 — Inner genetics/terpenes tabs lazy: lazy store resolution via injector.get()
- **Architectural decision — when a lazy tab lives INSIDE an eagerly-created component, the store injection must also be lazy:** deferring the terpene panel's TEMPLATE did not defer `/terpenes` — the parent component's field `inject(TerpeneStore)` creates the root singleton at construction, and Angular's `httpResource` issues its GET at resource creation. Solution: resolve TerpeneStore through a memoized `injector.get(TerpeneStore)` getter; the first read happens from the deferred template on tab activation, so the store (and its fetch) is created exactly then. `injector.get()` outside injection context is fine (explicit lookup). Pattern: `private getX() { return this.x ??= this.injector.get(X); }`.
- **General rule:** lazy template ≠ lazy fetch when the data source is a root-injected eager resource. Defer the injection chain, not just the view.
- **No architecture diagram change** — component-level behavior.

## 2026-08-17 W7 — Frontend 492/492: 16 pre-existing failures resolved (spec-only)
- **Decision — PrimeNG test setup needs real services, not shape mocks:** both `<p-confirm-dialog>` (subscribes to `confirmationService.requireConfirmation$`) and `<p-toast>` (subscribes to `messageService.messages`) crashed on partial mocks; real `MessageService`/`ConfirmationService` classes are safe in TestBed and are the fix.
- **Test lesson — sync mocks defeat async-protected flows:** the interceptor single-flight test used a synchronous `of()` refresh, which completed + finalized the shared in-flight observable before the second concurrent 401 landed (2 refreshes). Real production refresh is an HTTP call — the test now uses `delay(10)` to preserve the window.
- **No production code touched; no architecture diagram change.**

## 2026-08-17 W6 — Backend 399/399: pre-existing failures + SSRF dev-allow hardening
- **Architectural decision — dev-localhost bypass is opt-in, not default:** `assertSafeUrl` had `if (isDev && isLocalhost) return` (fail-open in dev), introduced by 82d9baa, reverted by 021224b, re-added by 31eadd9 — which silently broke the C3 SSRF tests (dc1d909). The fix makes the bypass explicit: `assertSafeUrl(url, { allowDevLocalhost: true })` is passed ONLY by the provider-baseUrl TOCTOU call sites (OmniRoute runs on localhost in dev); `downloadBuffer` (user-supplied sourceVideoUrl) is strict in every environment — a dev machine often hosts sensitive local services, and a video-extension endpoint must never fetch them. Do not reintroduce a blanket dev-allow.
- **Test-hygiene lesson:** stale tolerance bands (swagger-parser [66,68] vs real 75-tool spec) and missing mock methods (agent-session createQueryBuilder) were the other 4 failures — spec updates only, prod untouched.
- **No architecture diagram change** — behavioral hardening of an existing guard; same module boundaries.

## 2026-08-17 W5 — Login submit hit-target fix (disabled + pointer-events:none)
- **Architectural decision — never disable form submit on invalid:** the earlier overlay theory for the login-button actionability failure was disproven live (`elementFromPoint` showed the FORM as hit target; the ConfirmDialog measured 0×0). Real chain: global `&:disabled { pointer-events: none }` (`_buttons.css:48`) + `[disabled]="form.invalid || loading"` → empty form → button not a hit target at all → automation needs force-click. Fix: drop invalid from the disabled binding (keep loading-disabled), guard in `onSubmit` with `markAllAsTouched()` so an empty-form click surfaces the validation errors. Register fixed identically (sibling). This also matches a11y best practice: disabled buttons give no feedback.
- **No architecture diagram change** — component-level behavior only.

## 2026-08-17 W4 — RequiresConfirmation decorator relocated to core/decorators
- **Architectural decision — cross-cutting decorators belong in core:** `@RequiresConfirmation()` lived under admin-agent but was consumed by llm-provider + users (cross-module pollution, audit-dependency-map finding #1). Moved to `core/decorators/` with git mv (zero content change) — the decorator writes both NestJS metadata and the `x-requires-confirmation` OpenAPI extension, untouched; the C5 boot assertion in main.ts (3 expected ops) passed live after restart.
- **Hygiene:** swagger-tools.parser imported `REQUIRES_CONFIRMATION_KEY` but never used it (runtime check reads the literal string) — dead import removed while fixing the path.
- **No index.ts in core** — core has no index-file pattern; a new one would have been speculative. No architecture diagram change.

## 2026-08-17 W3 — ServiceResultContainer audit is now fully green
- **Finding — the audit doc drifted from the code:** the per-endpoint table still flagged ideas sessions ×2 + unread-count as ❌ after today's cluster commits. Verified against the controller: GET /sessions + /sessions/:id wrapped in 1aa5348, GET /nightly/unread-count already returns `{success, message, result: count}` (live-verified), favorite/mark-read already 204. Corrected the audit doc to match the code. Lesson: audit docs must be reconciled against code before quoting counts.
- **Environment discovery — not an npm-workspace monorepo:** there is NO root package.json; `npm run -w backend` fails (AGENTS.md is wrong about this). Backend commands run from `backend/`. The running backend executes `node dist/main` — src edits need `npm run build` (in backend/) + restart; there is no live watch in the current setup.
- **No architecture diagram change** — audits/docs only.

## 2026-08-17 W2 — strain-hunter cluster wrapped in ServiceResultContainer
- **Decision — wrap at the controller, keep the service raw:** the three strain-hunter endpoints (GET /fetch, GET/PUT /preferences) now return `{success, message, result}` with the original payload under `result`. Service methods stay raw so internal callers (none exist today) are unaffected; the wrap is a presentation concern. Same pattern as the calendar/llm clusters.
- **Consumer check (golden rule):** frontend parse sites updated — `strain-hunter.ts` unwraps `result.items`/`result.lastScrapedAt`; `matching-engine.store.ts` unwraps `result.prefs/weights` (PUT response unused). LLM agent tools receive container JSON like every other tool — no executor change.
- **Lesson — never write Hebrew via inline `curl -d` in git-bash:** the shell mangles UTF-8 on Windows, which corrupted a live PUT of matching preferences; restored byte-exact via `--data-binary @file` with a UTF-8 payload file.
- **No architecture diagram change** — same endpoints, same request flow; only response shape.

## 2026-08-17 W1 — httpResource `value()` throw guard (dashboard "0 users" fix)
- **Decision — never read `resource.value()` unguarded:** Angular throws when a resource is in error state (documented: "Reading the value signal on a resource that is in error state throws at runtime"). The `50e11c0` httpResource refactor introduced `computed(() => resource.value()?.result ?? [])` in 4 stores (users/terpene/genetics/llm-provider); any failed load (backend watch-mode restart) threw inside the computed, broke every consumer, and httpResource never retries → permanently stuck empty UI. All 4 now guard with `hasValue()`; stores with pageState (users, llm-provider) also surface the resource error instead of silently showing Empty.
- **Lesson — HTTP-failure handling is part of the reactive contract:** httpResource's `.value()` is NOT a safe default read, and its failures don't self-heal. Guards + explicit error states are required wherever a resource backs a store computed.
- **No architecture diagram change** — store-internal state handling only.

## 2026-08-16 A5 — site: operator client-side enforcement + PullPush channel sunset
- **Architectural decision — client-side `site:` enforcement:** SearXNG forwards the raw query to every engine; operator semantics are engine-dependent. Live evidence 2026-08-16: bing.com itself ignores `site:` for anonymous traffic (direct curl returned speedtest.net for `site:reddit.com test` — page title proves the operator was received), google cse and brave honor it, and SearXNG's result merge mixes both. Therefore `WebSearchService.search()` now parses `site:`/`-site:` from the original query (`parseSiteOperators`) and filters merged results by hostname (exact or subdomain, `urlMatchesSite`). The operator still travels in the query so honoring engines can use it — the filter only removes what ignoring engines leak in.
- **Architectural decision — PullPush removed:** the API now answers every request with 429 `"does not provide free scraping resources for agents"` (verified live, persistent across retries/waits). The 1.5s-serial-queue + retry + 10-min circuit breaker (A4) was correct engineering for a rate limiter, but this is a paywall — dead channel deleted, not throttled. Ideas signal fan-out is now 2 channels (SearXNG + HN Algolia). Reddit coverage when google cse/brave answer `site:reddit.com` queries + the new post-filter replaces it.
- **Open issue logged:** 5 SearXNG engines suspended/CAPTCHA from this residential IP (brave/ddg/qwant/startpage/mojeek) — separate investigation, not addressed here.
- **No architecture diagram change** — provider list in the diagram loses PullPush as an active channel; internal flow unchanged.

## 2026-08-16 A4 — Nightly ideas pipeline: resilience layer + model-class lessons (10-round incident)
- **Final outcome:** pipeline fully working — 2 grounded sessions × 5 ideas saved per run (~7.5 min end-to-end on `openrouter/google/gemma-4-31b-it:free`).
- **Architectural decision — direct-API query translation:** HN Algolia and PullPush receive operator-stripped queries (`toDirectApiQuery`: no `site:`, `-excl`, `OR`, quotes) because literal-text APIs treat search syntax as dead tokens (0 results; PullPush even 400s on unbalanced quotes). HN additionally gets only the first 3 significant words — Algolia ANDs every word, so long keyword chains match nothing (live-verified: 2-3-word queries return relevant stories).
- **Architectural decision — PullPush rate-limiter:** all PullPush calls pass a serialized in-service queue (1.5s min interval) with one 3s-backoff retry on 429; a double-429 opens a 10-minute circuit breaker that short-circuits calls (checked both at entry AND inside the queue task) with zero HTTP. External IP blocks outlast any client-side throttle — the breaker converts a dead channel from "30s wasted per phase" to "instant skip + self-healing probe".
- **Architectural decision — grounding fan-out:** `gatherSignals` fans its 5 queries to SearXNG + HN + PullPush like `discoverTopics`. Grounding must never depend on one channel: HN is the reliability workhorse (100% trusted-domain yield), SearXNG is flaky (only bing answers; engine rotation), PullPush is best-when-unblocked.
- **Lesson — thinking-model budget headroom:** reasoning models (OmniRoute `auto`, glm-4.7-flash) burn invisible reasoning tokens against `max_tokens`; symptoms are truncated JSON (`finish_reason=length`) or completely empty content, and the failure is intermittent per-routing. All ideas-pipeline budgets now assume thinking overhead (3072/4096–8192/4096/8192). The durable fix was switching the nightly model to a NON-thinking model (`google/gemma-4-31b-it:free`) via `IDEAS_NIGHTLY_MODEL`.
- **Decision — `IDEAS_NIGHTLY_MODEL` parses on the FIRST slash only:** model IDs may themselves contain slashes (`openrouter/google/gemma-4-31b-it:free`, `cloude-flare/@cf/...`); `split('/', 2)` truncated them. `resolveEffectiveModel` passes explicit overrides through unvalidated, so provider key + full model string is the contract.
- **Decision — retry covers parse, not just throw:** `discoverTopics` retries when the LLM call throws (empty content) AND when the returned JSON is null/truncated — both are the same underlying budget starvation. Retry warning logs `finish_reason`.
- **Decision — snippet diet:** discovery snippets capped at 280 chars × 12 per prompt. Long prompts amplify thinking-token burn on reasoning models.
- **No architecture diagram change** — same three signal providers already documented; all changes are internal resilience/budget tuning.

## 2026-08-16 A2 — Multi-channel signal discovery: SearXNG demoted to best-effort
- **Architectural decision:** topic-discovery signal gathering now fans each query to three parallel channels: SearXNG (best-effort), HN Algolia (`searchHackerNews`), and PullPush Reddit archive (`searchRedditArchive`). Rationale: every self-hosted SearXNG general engine died under bot detection from a single residential IP (brave/google cse "Suspended: too many requests", duckduckgo/startpage CAPTCHA — verified live via the JSON API); bing responds but silently drops `site:` (returns generic results); a single scraping channel could not deliver trusted-domain signals reliably. HN Algolia and PullPush are keyless public APIs without bot detection, and both return URLs on trusted domains by construction (news.ycombinator.com item links, reddit.com permalinks), so `isTrustedSignalUrl` keeps them without filtering.
- **Decision:** Reddit is reached via PullPush (pushshift successor), NOT `reddit.com/search.json` (403 without OAuth; `old.reddit` soft-blocks with empty results). Trade-off: archive freshness lags hours behind live Reddit — acceptable for nightly pain-point mining.
- **Decision:** SearXNG is kept (not replaced) — it still serves other consumers (genetics/terpenes enrichment) and remains a best-effort third channel when its engines are not suspended. `docker/searxng/settings.yml` now explicitly enables bing/mojeek/qwant as extra general engines.
- **Architecture diagram updated** — IdeasModule node + nightly-cron flow now list the three signal channels.

## 2026-08-16 A1 — Discovery fallback queries aligned with the trusted-domain filter
- **Architectural decision:** `FALLBACK_DISCOVERY_QUERIES` in `IdeasService` are now `site:`-scoped to `TRUSTED_SIGNAL_DOMAINS` (reddit ×2, news.ycombinator.com, indiehackers.com) instead of generic evergreen queries. Rationale: the fallback fires exactly when the LLM query-generation step fails, and the downstream `isTrustedSignalUrl` filter drops every non-trusted-domain result — generic fallback queries guaranteed a 0-topic night on any LLM failure (observed live: 40/40 results dropped). The fallback now encodes the same `site:` guidance `DISCOVERY_QUERY_GENERATION_PROMPT` already gives the LLM.
- **Context:** the triggering incident was NOT the fallback itself but an invalid DB model row (`openrouter`/`google` → OpenRouter 400). The fallback fix is defense-in-depth so one broken model no longer collapses the whole nightly run to zero.
- **No architecture diagram update needed** — internal constant change.

## 2026-08-14 A1 — Ideas validation: server-side riskPenalty + solo-dev actionable fields
- **Architectural decision:** the final idea score is now computed server-side as `competition + signalFit + feasibility + marketSize − riskPenalty` (clamped 1–10) in `validateSingle`. The LLM returns `riskPenalty` (0–3) inside `validationBreakdown`, but the subtraction and clamp happen in the service — the model cannot inflate the score by omitting or under-weighting the penalty. Previously `risks` were purely decorative and never affected the score.
- **Architectural decision:** a missing `riskPenalty` in LLM output defaults to 0 (`clampBreakdownScore` treats non-numbers as 0), keeping backward compatibility with models/outputs that predate the field.
- **Architectural decision:** the three new solo-dev fields (`techStackSuggestion`, `firstDistributionStep`, `estimatedMvpDays`) are nullable columns on `saved_ideas` with no migration file — TypeORM `synchronize: true` applies them, matching the precedent set when `validationBreakdown` was added. Frontend guards all three with `@if`, so pre-existing rows (nulls) render unchanged.
- **Architectural decision:** competitor names link out to Google search (`competitorSearchUrl`) rather than to competitor sites — competitor data is plain strings with no URLs; a search link needs no backend change.
- **Architectural decision:** `VALIDATION_PROMPT` now mandates concrete solo-dev outputs: real API/library names for the stack, one zero-budget distribution channel, and an honest MVP-days estimate (clamped 1–365 server-side).
- **No architecture diagram update needed** — scoring formula and card rendering are IdeasModule internals; module boundaries and request flow unchanged.

## 2026-08-13 A2 — `clampScore` accepts optional `validationScore`
- **Decision:** `ValidationResult.validationScore` is optional (`number | undefined`). `clampScore` parameter widened to match. No runtime change — existing `typeof` guard already returns 1 for `undefined`.

## 2026-08-13 A1 — Separate page-level vs per-item loading signals in `IdeasStore`
- **Architectural decision:** `loadSessions()` (full list) and `loadSession(id)` (single item) used to share the same `historyLoading` signal. This caused a visible flicker on first accordion expand because `loadSession` momentarily flipped `historyPageState` from `Ready` to `Loading`, unmounting the entire `@switch` block (sessions list + stagger animations) and remounting it on resolution.
- **Architectural decision:** the store now exposes a granular API — `historyLoading` (page-level, used by `loadSessions` only) and `loadingSessionIds: signal<Set<number>>` (per-item, used by `loadSession`) + `isSessionLoading(id)` helper. The component reads `ideasStore.isSessionLoading(session.id)` for per-row spinners without affecting the page-level state.
- **Architectural decision:** `toggleExpand()` in `ideas-history.ts` is now `async`: `await loadSession()` → `await requestAnimationFrame()` → `expandedSessionId.set()`. The 1-frame gap (~16ms) lets Angular commit the new `<app-idea-card>` children before the grid `0fr → 1fr` animation tries to interpolate to their height. Imperceptible to users; eliminates the "snap-from-60px-to-600px" content jump.
- **Architectural decision:** the `::ng-deep` block in `ideas-history.css` (12 lines) was deleted entirely. It targeted `.idea-card-wrapper` (a class that does not exist in the template — verified by grep) and was overriding `position: static` / `transform: none` / `transition: none` on `.idea-card` to fight a `position: absolute` that was never actually set. Dead code that was causing real style-recalculation cost on every first mount.
- **No architecture diagram update needed** — signal separation inside an existing store + 2 cosmetic CSS changes (`.glass-effect::before will-change: filter`, `.ideas-loading min-height: 220px`).

## 2026-08-12 A1 — SavedIdea as the frontend single source of truth
- The frontend now consumes `SavedIdea` everywhere (IdeaCard, ideas-history, ideas-page). `BusinessIdea` is retained ONLY as the SSE DTO in `idea.interface.ts`; the store maps it → `SavedIdea` via `toSavedIdea` (null arrays → `[]`, `validationReason` → `''`).
- `SavedIdea` fields (`risks`/`competitors`/`nextSteps`/`signalsReferenced`/`validationReason`) are normalized to non-null, with null coercion at the store boundary (`toSavedIdea`, `normalizeSaved`). This removes the 4 nullable-array computeds from `IdeaCard`.
- Generated (live) ideas have no `id` → favorite toggle hidden in `IdeaCard`; only persisted history ideas (with `id`) expose it.
- **Finalization:** `ideas-grid` component deleted; `ideas-page.html` renders `<app-idea-card>` directly with parent-managed `expandedIndex`. `IdeaCard` is a clean controlled component. Since the backend auto-saves every idea on generation, the `SavedIdea` shape is the single source of truth across the entire frontend; `BusinessIdea` is strictly an internal SSE streaming type.

## 2026-08-12 A2 — apiKey transformer must not clobber stored keys
- `llm-provider.entity.ts`: the `apiKey` transformer returns `undefined` when the input is `undefined` or empty, so a PATCH that omits the key leaves the existing encrypted column untouched (TypeORM `update()` skips `undefined` columns).

## 2026-08-05 C5 — Confirmation flow activated + H3 self-confirmation closed

- **Architectural decision:** the `@RequiresConfirmation` decorator now writes two things via `applyDecorators`: NestJS metadata (`SetMetadata`) for runtime Reflector checks, and an OpenAPI extension (`ApiExtension('x-requires-confirmation', true)`) so the swagger-spec.json reflects the dangerous operations. This was the minimal fix — a full `DiscoveryService` registry was considered unnecessary.
- **Architectural decision:** a boot assertion in `main.ts` verifies the exact set of operationIds with `x-requires-confirmation: true` in the spec against a hardcoded expected list. This prevents the exact regression that caused C5 (decorator writes metadata but spec never receives it). Fails loud — the app will not start if the list drifts.
- **Architectural decision:** `AdminAgentController_confirmAction` is excluded from `getTools()` via a static denylist (`SwaggerToolsParser.HIDDEN_FROM_LLM`). The endpoint still exists for the UI (humans confirm via the frontend `pendingConfirmation` signal), but the LLM can never see it as a callable tool. This closes H3 (self-confirmation) in the same pass as C5.
- **No architecture diagram update needed** — decorator rewrite + assertion + filter inside existing modules.

## 2026-08-05 C3 — `extendVideo` source video download: SSRF + size guard

- **Architectural decision:** user-controlled download URLs (`sourceVideoUrl`) are validated twice: fast sync DTO validation (`@IsSafeUrl()` — https-only, blocklist, private-range match) and authoritative runtime validation (`assertSafeUrl()` — DNS + ipaddr) inside `downloadBuffer()`, which is the single download funnel for both user URLs and provider-resolved videoId URLs.
- **Architectural decision:** `downloadBuffer()` uses `redirect: 'manual'` with per-hop re-validation (max 5 hops, relative locations resolved against the current URL) instead of letting fetch follow redirects silently to internal hosts. Body is streamed with a 100MB cap (plus a `content-length` pre-check) to prevent OOM.
- **No architecture diagram update needed** — a validator + hardened fetch inside the existing `LlmModule`.

## 2026-08-05 C4 — Google Calendar: server-side OAuth token storage + per-route authz

- **Architectural decision:** Google Calendar OAuth refresh tokens are now stored server-side, encrypted at rest (AES-256-GCM via the existing `EncryptionService`), in a new `google_calendar_tokens` table keyed by `userId`. They are never accepted from client input and never returned in responses.
- **Architectural decision:** the OAuth `callback` route is the only `/calendar` route without `JwtAuthGuard` (it is a browser redirect from Google, so no Authorization header can be sent). It is authenticated by the OAuth `state` parameter: a random 32-byte value persisted as an httpOnly `gcal_state` cookie plus a non-expired DB row bound to the user who started the flow. This closes the OAuth CSRF / account-binding vector without requiring a session middleware.
- **Architectural decision:** the shared singleton `google.auth.OAuth2` client was removed — `setCredentials()` on a shared client leaks tokens between concurrent users. Each call now constructs its own client.
- **Architectural decision:** a dedicated table (not `users` columns) holds the transient OAuth state so it doesn't pollute the `User` entity; migration `AddGoogleCalendarTokens1765000000000` declares the FK/`ON DELETE CASCADE` explicitly. Note: `app.module.ts` still runs `synchronize: true`, so the table would be auto-created on boot anyway — the migration is the documented DDL path and stays consistent with the encryption-migration precedent.
- **No architecture diagram update needed** — no new module boundary or external provider; the change stays inside the existing `GoogleCalendarModule`.

## 2026-08-05 Media Studio LLM Provider Payload Check

- Runtime finding: `/llm-provider` returns the `capability` field on every model object, but the live payload currently reports every model as `text`.
- Operational cause to verify/fix: `agnes-ai` media model rows are present but have stale capabilities (`agnes-image-2.0-flash`, `agnes-image-2.1-flash`, and `agnes-video-v2.0` all returned as `text`).
- No architecture decision changed. No architecture diagram update needed.

## 2026-07-25 CSS Cleanup — Labels, Compact Inputs, Number Steppers

- **Architectural decision:** consolidated bare `label` styles into one global rule in `_typography.css` (font-size sm, font-weight medium, color text-primary). Component-scoped label overrides (like `.composer-count label { white-space: nowrap }`) stay local for context-specific needs.
- **Architectural decision:** created global `.compact-input` class with `xs`/`sm`/`md`/`lg` size variants in `_forms.css` for inline toolbar inputs. This replaces duplicated input styles that existed in both `_composer.css` and `media-studio.css`.
- **Architectural decision:** number spinner hiding is now global for all `input[type='number']` via `_forms.css`. Custom `.number-stepper` with `ph-caret-up`/`ph-caret-down` buttons replaces native spinners.
- **No architecture diagram update needed** (CSS-only, no new components or endpoints).
- **Files touched:** `_typography.css`, `_forms.css`, `_composer.css`, `media-studio.css`, `media-studio.html`, `media-studio.ts`, `ideas-form.html`, `ideas-form.ts`.

## 2026-07-22 Main Sidebar — Chat History Dropdown Fix

- **Architectural decision:** the `.nav-item-chat` pattern (hover-to-reveal history button with dropdown, absolute positioning, RTL-aware `inset-inline-end`) is reusable. When adding history to Ideas (`/ideas`) and Media Studio (`/media`), extract this into a shared component or a shared CSS pattern in `_utilities.css` rather than duplicating per-page.
- **Architectural decision:** `<app-dropdown>` must sit outside `<button>` elements — `backdrop-filter` (glass-effect) does not work inside buttons due to opaque rendering context, and click events bubble to the parent `routerLink`.
- **Files touched:** `main-sidebar.html`, `main-sidebar.ts` (added `TooltipDirective`), `main-sidebar.css` (`.nav-item-chat` with absolute-positioned dropdown).

## 2026-07-22 Ideas Page — Chat-Style Composer Layout

- **Architectural decision:** lifted the shared composer shell (bottom-docked `.composer-area`, focus-glow `.composer-field`, circular send/stop `.composer-submit`) into a new global partial `frontend/src/app/assets/styles/_composer.css`, and refactored both chat and ideas to use it. This honors the project's CSS rule that reusable patterns belong in global files, not per-component copies, and prevents drift if a third "composer" UI is built later.
- **Architectural decision:** stop-while-loading on the ideas page is implemented entirely on the existing `controller.abort()` Observable teardown path inside `IdeasService.generateStream`. No new HTTP plumbing, no new API; the store simply unsubscribes the SSE subscription. The store filters `AbortError` from the error path so clean stops do not surface as a page error, matching the chat page's behavior.
- **Architectural decision:** ideas-form structure changed from a top-down `glass-effect card` (domain field, count slider, model select, submit stacked vertically) to a single bottom-docked composer-field with a top-aligned domain input and a meta row that splits the count slider (left) from the model select + circular submit (right). The model `<p-select>` template is unchanged because the group/item content is already component-local convention.
- **Files touched:** `frontend/src/app/assets/styles/_composer.css` (new), `frontend/src/styles.css`, `frontend/src/app/features/chat/chat/chat.html`, `frontend/src/app/features/chat/chat/chat.css`, `frontend/src/app/features/ideas/ideas-page/ideas-page.html`, `frontend/src/app/features/ideas/ideas-page/ideas-page.css`, `frontend/src/app/features/ideas/ideas-form/ideas-form.html`, `frontend/src/app/features/ideas/ideas-form/ideas-form.css`, `frontend/src/app/features/ideas/ideas-form/ideas-form.ts`, `frontend/src/app/core/store/ideas.store.ts`, `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.

## 2026-07-21 Business Idea Generator — Closed (Verification Session)

- **Architectural decision:** the Ideas module was already fully implemented before this session. This was a verification + documentation close-out session only — no code changes.
- **Architectural decision:** `ThrottlerModule.forRoot` uses two named throttlers (`ideasCostShort`: 30 hits/60s, `ideasCostLong`: 150 hits/3600s) with `skipIf` scoping to `/ideas` routes so existing authenticated routes are unaffected. The custom `IdeasThrottlerGuard` extends `ThrottlerGuard` and loops `storageService.increment()` `weight = max(count, 1)` times to implement weighted rate limiting, since throttler v6 removed the `weight` parameter.
- **Architectural decision:** the controller uses `JwtAuthGuard` (authenticated, not public). The plan's open decision said "Default to public with rate limiting for now, lock down later if needed" — the implementation chose to lock down immediately. This is acceptable given the cost amplification risk (each request triggers SearXNG × 3 + LLM × (N+1) calls).
- **Architectural decision:** SSE progress streaming (`GET /ideas/generate/stream`) coexists with synchronous `POST /ideas/generate`. The frontend uses the SSE endpoint exclusively (via raw `fetch` + `ReadableStream`, not `EventSource`, to preserve cookie-based auth). The synchronous POST exists for tests, GenUI tool calls, and non-streaming consumers.
- **Architectural decision:** the `IdeasThrottlerGuard` is applied globally as `APP_GUARD`. Because `skipIf` excludes non-`/ideas` routes at the throttler config level, the guard is effectively a no-op for all other routes. This avoids needing per-controller `@UseGuards` decoration.
- **Files touched:** `documents/done/business-idea-generator-plan.md` (moved), `documents/done/chat-idea.md` (moved), `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.
- **Architecture diagram needs update:** new `IdeasModule` (imports `LlmModule` + `WebSearchModule`), `IdeasController` (`POST /ideas/generate` + SSE `GET /ideas/generate/stream`), `IdeasThrottlerGuard`, and frontend `IdeasPage` with 5 components. Deferred — the diagram update is noted but not done this session.

## 2026-07-20 Loader Shimmer — Implemented (Phases 1, 2, 3, 5, 6)

- **Architectural decision:** the shimmer primitive is now live in `_utilities.css` and `_animations.css`. Three pill sizes (sm/md/lg) plus a text-shimmer variant, all driven by `@keyframes shimmer-sweep` with an RTL mirror keyframe. Gradient uses `color-mix()` over existing tokens — no new color tokens introduced.
- **Architectural decision:** the chat step loading indicator now shows `טוען...` with shimmer-text (gradient sweep on the text) instead of a pill placeholder. The user chose visible text over a structural pill for the chat's inline loader. A spinner icon (`ph-spinner ph-spin`) accompanies the text.
- **Architectural decision:** the dead `.response-loader` rule and the `responseLoaderPulse` keyframe were removed from `chat-message.css` (zero consumers verified by grep). The `.loading-dots` block inside `.step-item.is-loading` was also removed since the template now uses `.shimmer-text`.
- **Architectural decision:** strain-hunter's `.loading-dots` (static) and `.dots-loader` (animated) were both replaced with `<span class="shimmer shimmer--sm">` using the global utility. The `dot-bounce` keyframe was removed.
- **Architectural decision:** text shimmer wraps `טוען...` in login/register buttons and `מבצע העשרה...` in strain-hunter-settings bulk-enrich buttons, plus `טוען נתוני מסד נתונים...` in database-monitor-settings. The underlying text stays in the DOM for screen readers.
- **Phase 4 (`.custom-loader` rebrand) remains deferred.** The 6 page-level consumers and the duplicate in `chat.css:27-34` are unchanged. The audit-report section 1.10 stays open.
- **Files touched:** `_animations.css`, `_utilities.css`, `chat-message.html`, `chat-message.css`, `strain-hunter.html`, `strain-hunter.css`, `login.html`, `register.html`, `strain-hunter-settings.html`, `database-monitor-settings.html`.
- **No architecture diagram update needed** — CSS-only changes with no new components, endpoints, or cross-module boundaries.

## 2026-07-20 Loader Shimmer — Plan written, chat loader fix landed

- **Architectural decision:** the project currently has 6 distinct animated loader patterns (rotating border, three-pulse rectangles, three-bounce circles, static three-dots, icon-font spinner, PrimeNG ProgressSpinner). The plan unifies them under a single shimmer primitive (`.shimmer`, `.shimmer-text`, `.shimmer-circle`) defined in `_utilities.css`, driven by one `@keyframes shimmer-sweep` and one `@keyframes shimmer-rotate` in `_animations.css`. This matches the project's "one keyframe, one declaration" rule (`css-duplicate-styles-remediation-plan.md:37`).
- **Architectural decision:** two shape variants on a single primitive — inline pill for empty/structural loading, text shimmer for in-line strings. The user's preference (from the planning conversation) was Option 1 (pill) as the empty-step fallback + Option 2 (text shimmer) when a message is present. The plan codifies this as `.shimmer--md` (120×6px pill) for chat steps and `.shimmer-text` (gradient on text node) for `טוען...` / `מבצע העשרה...` strings.
- **Architectural decision:** the 48×48 page-level `.custom-loader` becomes a *shimmer ring* (conic gradient masked to an arc, rotating 1.5s), not a 6px pill. Visual weight matters at page scale; a 6px pill would feel like a downgrade. The class name stays `.custom-loader` so the 5 templates that reference it need no template changes. **DEFERRED to Phase 4 — see "Deferred work" in the plan.** The user chose to validate the inline shimmer (Phases 2/3/5) for a sprint before committing to the highest-blast-radius change. Until Phase 4 is unblocked, the rotating border stays as-is across the 6 page-level consumers.
- **Architectural decision:** PrimeNG `<p-progressSpinner>` in `media-studio.ts:6` is *out of scope*. It is the media studio's deterministic generation progress, not a generic loader. Replacing it with a shimmer would lose determinism. If the user later wants to align the media-studio progress look with the rest of the app, it is a separate plan.
- **Architectural decision:** the icon-font spinner (`<i class="ph ph-spinner ph-spin">`) is also *out of scope*. It is a different visual family and the user's complaint was specifically about the chat's three dots. The `_utilities.css:216-218` `ph-spin` rule is left untouched. **This is now explicit and applies to both the active phases and the deferred Phase 4** — earlier drafts proposed rebranding it to a "shimmer ring" inside the same `<i>` element, but that has been dropped: it would create a third visual family that doesn't match either the inline pill or the existing rotating border, and the icon font cannot render a CSS gradient sweep meaningfully anyway.
- **Architectural decision:** the dead `.response-loader` rule in `chat-message.css:177-199` is removed as part of Phase 2. Verified by `rg -n "response-loader" frontend/src/app` — zero consumers in code, only one mention in a done/ plan document.
- **Architectural decision:** strain-hunter's `.loading-dots` (static, line 226) and `.dots-loader` (animated, line 243) are renamed to `.shimmer--sm` (Phase 3). The `dot-bounce` keyframe at line 494 is removed as unused. No test file references the old names.
- **Architectural decision:** RTL — the shimmer keyframe direction is mirrored in RTL via `[dir="rtl"] .shimmer::before`. Without this, the sweep would appear to move "the wrong way" in the Hebrew chat UI. Tested mentally against the chat's existing RTL layout; will need a visual confirmation during Phase 2.
- **Architectural decision:** `prefers-reduced-motion: reduce` is mandatory on every loader. The shimmer animation is disabled but the static shape (pill / ring / gradient text) remains, so the loader still reads as "loading" without movement.
- **Architectural decision:** the chat step `isLoading: true` empty step is the *first* consumer of the new primitive. The plan orders it as Phase 2 so Phase 1 (the primitive definition) lands first and Phase 2 is a one-line template change against it.
- **Files touched:** `frontend/src/app/features/chat/chat-message/chat-message.ts` (mark last active tool step as `isLoading: true`), `frontend/src/app/features/chat/chat-message/chat-message.html` (reorder so render blocks render before the steps), `documents/features/todo/loader-shimmer-plan.md` (new), `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.
- **No architecture diagram update needed** — the plan is CSS-only with no new components, endpoints, or cross-module boundaries.

## 2026-07-18 Agnes AI Multimodal Plan — Review and Rewrite

- Reviewed `documents/features/todo/agnes-ai-multimodal-plan.md` against the actual codebase and rewrote it in place. No code was changed in this session — plan only.
- Architectural decision: the seed's mis-keyed provider row (`agnes` instead of `agnes-ai`) plus the legacy `baseUrl: 'https://api.agnes.ai/v1'` (instead of `https://apihub.agnes-ai.com/v1`) means the Agnes chat model is currently unreachable through the DB path even with `AGNES_API_KEY` set. The plan now mandates a single reconciliation step (update-in-place, do not delete-and-reinsert) so existing model foreign keys stay intact. This is the project's first case of "rename an existing seed key" and the plan's reconciliation must come before the insert, otherwise the unique constraint on `key` will reject the new `agnes-ai` row.
- Architectural decision: the LlmModel `capability` field is an entity enum defaulting to `'text'`, seeded per Agnes model. The frontend `LlmModel` interface already drives the chat dropdown through the providers store; the plan filters the chat `<p-dropdown>` to `capability === 'text'` in one place, no new endpoint required.
- Architectural decision: the previous plan's Phase 1 added `capability` and called it done, but the nightly `LlmTasksService.handleNightlyLlmHealthCheck` cron iterates **all** active models and would start failing every image/video model nightly, polluting `llm_model_test_results`. The rewritten plan gates Phase 2 on the health-check guard — a hard prerequisite, not a nice-to-have.
- Architectural decision: video polling is on-demand per `GET /llm/video/:videoId` (not a background job) to match the project's existing "no scheduled retries for user-triggered long work" pattern. Free-tier models make abandoned `video_id`s cheap to discard.
- Architectural decision: the previous plan referenced a `GET /llm/model-options` endpoint that does not exist (`LlmController` only exposes `models/:id/test`, `test-results/:id`, `set-default-model`, `default-model`). The new plan removes that assumption and routes frontend capability filtering through the existing `findAll()` → providers store path.
- Architectural decision: the rewritten plan also drops the dead `isDefault: boolean` field from the frontend `LlmModel` interface (backend already removed it on 2026-07-18). Flagged as a follow-up so it does not get lost.
- Files touched: `documents/features/todo/agnes-ai-multimodal-plan.md`, `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.
- No architecture diagram update was needed because the new endpoints stay inside `LlmModule` — no cross-module boundary changes.

## 2026-07-18 MCP Bridge — Implementation Phases 1-3

- Architectural decision: MCP tool output is markdown text (not structured JSON). `callTool` flattens `content[].text` to a string. Render-spec transforms parse key values from markdown using regex. This is more fragile than JSON key access — pinned fixtures + snapshot-style field-existence tests mitigate drift.
- Architectural decision: `buildRenderSpec` checks for JSON error envelope even for MCP source (attempts `JSON.parse` on the string; if the result is an object with `error: true`, returns `null`). This catches the error envelope from `callTool`'s catch block. MCP `isError` responses (successful JSON-RPC but tool failed) are a known v1 gap.
- Architectural decision: SDK import workaround for Node 24. The SDK's `exports` map `./*` wildcard maps `./client/stdio` → `./dist/cjs/client/stdio` (no `.js` extension). Node 24 doesn't auto-append `.js` for exports-map-resolved paths. Fix: resolve via `@modelcontextprotocol/sdk/client` (which has a named export), navigate to `stdio.js` in the same directory. `sdk.d.ts` provides type declarations for TS; `require()` gives `any` at runtime but the actual types are correct.
- Architectural decision: standardized `MCP_ENABLED` to `process.env.MCP_ENABLED` in both `mcp-bridge.config.ts` and `admin-agent.service.ts` with `'false'` default. Removed `ConfigService` from `AdminAgentService` constructor to avoid DI complexity.
- Architectural decision: `source` field on `ToolRenderMapping` (not an `isMcp` boolean) because it's extensible if more sources appear later. Default is `'swagger'`.

## 2026-07-18 MCP Bridge Plan — Review and Rewrite

- Moved `documents/todo/add-mcp-plan.md` to `documents/features/todo/add-mcp-plan.md` per the project rule that new feature plans should go under `documents/features/`.
- Moved remaining 3 files from `documents/todo/` to `documents/features/todo/`, deleted the empty `documents/todo/` folder, and updated `HANDOFF.md` to reflect the new structure.
- Architectural decision: the `LlmToolSchema` extension goes on the parser's local type in `swagger-tools.parser.ts:14`, not on `llm/types/llm.types.ts`. There are two types in the codebase; the parser's is what `SwaggerToolsParser.getTools()` actually returns and the agent consumes, while `llm.types.ts` is the LLM-facing wire type. Keeping `source` off the LLM-facing type also means it cannot accidentally leak into the LLM's view of the tool list.
- Architectural decision: the render-spec adapter uses a per-mapping `unwrapResult: boolean` flag (default `true`, `false` for MCP). The alternative — wrapping MCP results in `ServiceResultContainer` — would force every future MCP server to match the backend's wrapper shape and defeat the "generic bridge" goal. The `unwrapResult` flag keeps each mapping explicit about its input contract.
- Architectural decision: the MCP bridge module is a top-level NestJS module under `src/modules/mcp-bridge/`, not a sub-module of `admin-agent`. Reasoning: it owns its own lifecycle (spawn/close), has no internal coupling to admin-agent types, and should be reusable in other NestJS apps. The bridge is opt-in via `MCP_ENABLED=false` default so the system boots unchanged when the bridge is off.
- Architectural decision: the bridge's `callTool` wraps thrown errors in a `{error:true, source:'mcp', toolName, message}` JSON envelope so render-spec's existing error short-circuit handles them cleanly. Without this, a transient MCP failure bubbles into `executeToolCallSafely`'s generic catch and produces a less informative error to the user.
- No code was changed in this session. No architecture diagram update was needed because the plan is still pre-implementation.

## 2026-07-15 Remove LLM Prose Duplication of Card Data

- Added a `VISUAL RESPONSE RULE` block to `SYSTEM_CONTEXT_BASE` in `backend/src/modules/admin-agent/constants/system-context.constant.ts` that tells the LLM structured tool results are auto-rendered as visual cards and that prose should not duplicate the same numbers/rows in markdown tables, bullet lists, or inline lists.
- Listed the 11 render-bearing tool types by name (weather forecast, currency conversion, users table, analytics chart, system status, database storage, chat sessions, transcript, LLM test results, delete confirmation, register form) so the rule has an explicit enumeration.
- Allowed inline reproduction only when the user explicitly asks for raw text-only output (screen reader, copy-paste).
- Architectural decision: the rule is generic across all render-bearing tools; no per-tool or per-component instruction list was added to the codebase.
- Architectural decision: the LLM still produces natural prose around the render event for the brief intro, the system-protection warnings, and the data-integrity confirmations — only the duplication of structured data is suppressed.
- No architecture diagram update was needed because this was a system-prompt instruction only; the streaming event flow, render spec contract, and `RenderSpecService` are unchanged.
- Files touched: `backend/src/modules/admin-agent/constants/system-context.constant.ts`, `documents/HANDOFF.md`, `documents/STATUS.md`, `documents/LOG.md`.

## 2026-07-07 GenUI Speed and Quality Improvement — Implementation

- Implemented all five phases of the GenUI speed and quality improvement plan.
- **Phase 1 — Progressive Streaming Rendering:** Added `extractProgressiveComponentParts`, `sanitizeProgressiveComponentHtml`, `sanitizePartialComponentCss`, `scheduleProgressivePreview` (rAF-throttled), and `renderProgressivePreview` (stable preview host) to `AiFormat`. Closed-fence finalization reuses the preview host to avoid DOM thrash. Added `OnDestroy` cleanup.
- **Phase 2 — Smarter Chat Message Flushing:** Added `isInsideComponentStream()` to `ChatMessage`. Component streams flush 12-24 char chunks at 0ms delay; prose keeps 18-35ms cadence. Cursor hidden in component mode.
- **Phase 3 — Backend Prompt Trimming:** Split `SYSTEM_CONTEXT` into `SYSTEM_CONTEXT_BASE` and `SYSTEM_CONTEXT_GENUI`. Added `buildSystemContext({ includeGenui })` and `VISUAL_TRIGGER_KEYWORDS`. `AdminAgentService.getDynamicSystemContext()` conditionally includes GenUI. Trimmed per-template boilerplate from `gen-ui-spec.constant.ts`.
- **Phase 4 — Streaming Efficiency:** Added rAF-coalesced token buffering (`pendingTokenBuffer`, `scheduleTokenFlush`, `flushPendingTokens`) in `Chat`. Tokens flushed before `loading.set(false)`, on error, and on stream stop.
- **Phase 5 — Documentation:** Updated `documents/architecture-diagram.md` with streaming event flow sequence diagram. Added `[AdminAgentStream]` log line (firstTokenMs, totalMs, tokens, components). Created `documents/architecture/genui-streaming-protocol.md`.
- Architectural decision: progressive rendering is the default without a feature toggle; the skeleton fallback handles edge cases safely.
- Architectural decision: GenUI keyword list is simple and in code for easy reversion; a future phase can move it to per-tool metadata.
- Architectural decision: token coalescing uses rAF with setTimeout fallback for environments without requestAnimationFrame.
- No additional architecture diagram update was needed beyond the streaming event flow sub-diagram added in Phase 5.

## 2026-07-07 GenUI Speed and Quality Improvement Plan

- Added `documents/features/todo/genui-speed-and-quality-improvement-plan.md` covering five phases: frontend progressive streaming rendering, smarter chat-message flushing, backend prompt trimming, streaming and store efficiency, and documentation/observability.
- The new plan replaces the older `documents/done/genui-progressive-streaming-rendering-plan.md` as the source of truth for GenUI rendering work. The older plan is kept as historical reference and the new plan's Phase 1 is the implementation of what the older plan proposed.
- Planning decision: keep the streaming protocol (`step` / `token` / `done` JSON lines) unchanged in version 1; speed wins come from prompt trimming, rAF-coalesced token updates, a stable preview host in `AiFormat`, and a small parsed-markdown cache for the text before the ` ```component ` fence.
- Planning decision: split the backend system context into `SYSTEM_CONTEXT_BASE` and `SYSTEM_CONTEXT_GENUI`, and gate the GenUI spec on simple visual-trigger keywords to shrink prompts for short tool-call / prose requests.
- Planning decision: the architecture diagram and a new `documents/architecture/genui-streaming-protocol.md` document the streaming event flow in one place so future GenUI work does not have to rediscover the pipeline.
- No architecture diagram update was needed for this planning-only session; Phase 5 of the plan contains the explicit diagram update step.

## 2026-07-03 GenUI Progressive Streaming Rendering Plan

- Added `documents/features/todo/genui-progressive-streaming-rendering-plan.md`.
- Planning decision: keep version 1 frontend-only by adding a progressive parser inside `AiFormat` before changing backend streaming protocol.
- Planning decision: partial rendering must reuse the existing GenUI sanitizer rules; unsafe tags, unsafe selectors, and CSS custom property overrides remain blocked during streaming.
- Planning decision: skeleton remains the fallback only while partial GenUI is too incomplete to render safely.
- No architecture diagram update was needed because this session created a plan only and did not change runtime architecture.

## 2026-06-20 LLM Providers Management — PrimeNG Dialogs

- Added PrimeNG `p-dialog` for provider and model create/edit in `frontend/src/app/features/llm-providers-management/`.
- Provider dialog fields: key, label, baseUrl, apiKey (password input), active toggle (`p-toggleSwitch`).
- Model dialog fields: key, label, active toggle.
- "Add Provider" button added to page header action row.
- "Add Model" button added to expanded provider panel header bar.
- Edit provider button (`openEditProviderDialog`) and edit model button (`openEditModelDialog`) wired with pre-filled forms.
- Added model delete (`deleteModel`) via soft-disable PATCH `{ active: false }`.
  - `LlmProviderService` now exposes `deleteModel(modelId)`.
  - `LlmProviderStore` now exposes `deleteModel(providerId, modelId)`.
  - Model delete row button added next to the edit button in the model sub-table.
- Verification: `npx ng build` passes. New budget warning: `llm-providers-management.css` 6.43 kB over 4 kB limit (same pattern as `explorer.css` and `chat-message.css`).
- No architecture diagram update was needed because this was frontend UI addition only.

## 2026-06-20 LLM Providers Management Code Review

- Reviewed llm-provider-management backend (`llm-provider` module) and frontend (`llm-providers-management` feature).
- Fixed: `result.logOutput` → `result.errorMessage` in the test-results log-output table cell (`llm-providers-management.html:208`). Error messages now display instead of always showing "OK".
- Fixed: `model.modelId` → `model.key` in the model slug cell (`llm-providers-management.html:128`). Model slugs now render correctly instead of `undefined`.
- Cleanup: removed unused `BadgeColor` and `RippleModule` from `LlmProvidersManagement` component imports; the `BadgeColor is not used` Angular warning is resolved.
- Verification: `npx ng build` from `frontend` passes. Remaining warnings are pre-existing `explorer.css` and `chat-message.css` budget warnings only.
- No architecture diagram update was needed because this was data-binding and import cleanup only.

## 2026-06-20 LLM Test Results Retention Plan

- Added `documents/features/todo/llm-model-test-results-retention-plan.md`.
- Planning decision: keep the retention cleanup in the existing LLM/provider scheduled maintenance path instead of introducing a new module for a single table cleanup.
- Planning decision: default retention is 30 days and the proposed cleanup cadence is weekly at 02:00 server time.
- No architecture diagram update was needed because this session created a plan only and did not change runtime architecture.

## 2026-06-11 Global Icon Tile

- Added global `.icon-tile` as the shared padded-background icon treatment for dashboard metrics and design-system headings.
- Decision: keep the padded icon treatment in global utilities instead of repeating `section-heading > .ph` styling in feature CSS.
- Verified `npm.cmd run build` from `frontend` passes. Remaining warnings are existing unrelated warnings: unused `AccessToDirective`, `explorer.css` budget, and `chat-message.css` budget.
- No architecture diagram update was needed because this was styling only.

## 2026-06-11 Theme Switch Transition Block

- Added a temporary transition blocker to `frontend/src/app/core/services/theme.service.ts` so theme changes do not mix instant elements with animated `background-color` / `color` transitions.
- `ThemeService.applyMode(...)` now adds `no-transitions` before updating `data-theme` and removes it after two nested `requestAnimationFrame(...)` callbacks.
- Added `.no-transitions, .no-transitions * { transition: none !important; }` to `frontend/src/app/assets/styles/_reset.css`.
- Verified `npm.cmd run build` from `frontend` passes. Remaining warnings are existing unrelated warnings: unused `AccessToDirective`, `chat-message.css` budget, and `explorer.css` budget.
- No architecture diagram update was needed because this was local theme-toggle behavior only.

## 2026-06-11 Design Language Glassmorphism Upgrade

- Executed `documents/features/todo/DESIGN_UPGRADE_TASK.md`.
- Added theme-level glass tokens to `frontend/src/app/assets/styles/_variables.css` and increased ambient glow strengths for the new design language.
- Updated global visual primitives: `.glass-effect`, `.card`, `.metric-card`, `.table-container`, `.logo`, `.badge`, `.error-badge`, inputs, and `.primary-btn.filled`.
- Updated `body::before` in `frontend/src/app/assets/styles/_reset.css` to use the larger ambient ellipse gradients.
- Kept `_animations.css`, `_typography.css`, `_primeng-overrides.css`, component TS files, and component HTML files untouched as requested.
- Verified `npm.cmd run build` from `frontend` passes. Remaining warnings are existing unrelated warnings: unused `AccessToDirective`, `explorer.css` budget, and `chat-message.css` budget.
- Moved the completed task file to `documents/done/design-language-glassmorphism-upgrade-task.md`.
- No architecture diagram update was needed because this was global styling/design-language maintenance only.

## 2026-06-11 Design System Token Upgrade

- Rewrote `frontend/src/app/assets/styles/_variables.css` with the audited WCAG-oriented token system from `documents/features/todo/TASK.md`.
- Token decisions: dark and light surfaces are now solid instead of translucent, text secondary colors are stronger, borders are more visible, hover backgrounds use stronger `--primary-30` values, and the typography scale now uses a `15px` `--font-size-md` baseline.
- Added the missing shared tokens called out by the task: `--radius-xs`, `--radius-pill`, `--color-surface-elevated`, `--color-text-muted`, `--color-text-disabled`, `--color-border-strong`, warning tokens, status background/border tokens, elevated shadows, and glow background tokens.
- Updated `frontend/src/app/assets/styles/_reset.css` so `body::before` uses `--color-primary-glow-bg` and `--color-secondary-glow-bg` with full opacity.
- Verified no missing CSS custom property references were found across app CSS and no old transparent surface values remain under `frontend/src/app/assets/styles`.
- Verified `npm.cmd run build` from `frontend` passes. Remaining warnings are existing unrelated warnings: unused `AccessToDirective`, `explorer.css` budget, and `chat-message.css` budget.
- Moved the completed task file to `documents/done/design-system-token-upgrade-task.md`.
- No architecture diagram update was needed because this was global styling/token maintenance only.

## 2026-06-11 Explorer CSS Budget Fix

- Removed duplicate PrimeNG sort-icon overrides from `frontend/src/app/features/explorer/explorer.css`; the equivalent global rules already live in `frontend/src/app/assets/styles/_utilities.css`.
- Removed a redundant `NEW` badge hover background declaration in Explorer CSS.
- Verified `npx ng build` from `frontend` now passes again. Remaining output is warnings only: unused `AccessToDirective`, `chat-message.css` warning budget, and `explorer.css` warning budget at 7.97 kB.
- Fixed Explorer price sorting by enabling PrimeNG `customSort` and comparing `price`/`catalogPrice` through numeric values extracted from their display strings.
- Verified `npx ng build` from `frontend` after the Explorer numeric sort fix.
- Attempted the Angular 22 upgrade with `npx ng update @angular/core@22 @angular/cli@22`; Angular CLI 22 stopped before changing files because the current Node runtime is `v24.13.0`, below the required `24.15.0+` / `22.22.3+`.
- Completed the Angular 22 frontend upgrade after Node was updated to `v24.15.0`.
- Updated Angular packages to `22.0.1` and TypeScript to `6.0.3`.
- Applied Angular 22 migrations. The official migration had to be resumed with a temporary `frontend/app -> frontend/src/app` junction because the CLI generated migration paths without the `src/` prefix; the junction was removed after migration.
- Angular added explicit `ChangeDetectionStrategy.Eager` to all app components, added `withXhr()` to `provideHttpClient(...)`, added `$safeNavigationMigration(...)` wrappers in affected templates, and added extended diagnostic suppressions in `frontend/tsconfig.app.json`.
- Updated the stale `frontend/src/app/app.spec.ts` title test to assert the current root `router-outlet`.
- Verified `npx ng test --watch=false` and `npx ng build` after the upgrade.
- Recorded a remaining dependency risk: `primeng@21.1.8` still declares Angular 21 peer dependencies, and npm does not currently publish a PrimeNG 22 package.
- Marked the completed/reviewed Angular 22 update-guide checklist items in `documents/angular-22-update-guide.md`.
- Removed the temporary Angular 22 `$safeNavigationMigration(...)` helpers from `dashboard`, `main-sidebar`, and `users-management` templates, replacing them with normal Angular 22 safe-navigation expressions.
- Verified the cleanup with `rg '$safeNavigationMigration' frontend/src`, `npx ng test --watch=false`, and `npx ng build`.
- Moved the completed Angular 22 upgrade guide to `documents/done/angular-22-update-guide.md`; no architecture diagram update was needed.
- Completed AiFormat sanitizer Phase 2/3 in `frontend/src/app/core/directives/ai-format.directive.ts`.
- Added private GenUI HTML/CSS sanitization before raw component rendering: dangerous tags are removed, `:root`/`html`/`body` blocks and CSS custom property declarations are stripped, unscoped global selectors are blocked, scoped/local selectors and `@keyframes` are preserved.
- Added focused directive specs covering sanitizer behavior and verified with `npx ng test --watch=false` plus `npx ng build`.
- Completed and closed the AiFormat directive improvement plan.
- Added `renderSkeletonOnce()` for skeleton DOM rendering, centralized Hebrew role labels, preserved English role support, and expanded directive specs for component-stream detection, CSS code fences, role badge rendering, and markdown/table behavior.
- Moved the plan to `documents/done/ai-format-directive-improvement-plan.md`; no architecture diagram update was needed.
- Added `documents/features/todo/chat-stop-stream-button-plan.md` for changing the chat submit button into a stream stop/cancel button during loading.
- Documented that frontend cancellation can use the existing `ChatService.sendMessageStream(...)` Observable teardown, which already calls `AbortController.abort()`.
- Cleaned documentation audit folder: kept only `css-conventions-component-audit.md` in `documents/audit/`, moved `backend-llm-documentation-audit.md` to `documents/done/`, and deleted the Phosphor reference document.
- Completed chat stop-stream behavior: the chat submit button now switches to a stop button during loading, unsubscribes from the active stream, and aborts the underlying fetch through the existing `ChatService.sendMessageStream(...)` teardown.
- Completed chat message actions: each rendered chat message can request delete, send again, copy, or edit through a typed child-to-parent event.
- Added persistent message deletion endpoint `DELETE /admin-agent/sessions/:sessionId/messages/:messageId`; backend verifies session ownership and message membership, then deletes the selected message and later messages in that session.
- Regenerated `backend/swagger-spec.json` so the admin-agent tool catalog includes the new message deletion operation.
- Updated `documents/architecture-diagram.md` to document stream cancellation and persistent chat message action deletion flow.
- Verified after the chat changes with `npx ng test --watch=false`, `npx ng build`, and `npm.cmd run build`.
- Closed the stale Explorer todo entry by moving `documents/features/todo/explorer-plan.md` to `documents/done/explorer-source-reference.md`; it is now treated as source/reference material, not an active plan.
- Removed borders from chat message action buttons and verified the frontend build; no architecture diagram update was needed because this was a local styling change.
- Updated Angular 22 baseline documentation in `frontend/README.md`, `AGENTS.md`, `CLAUDE.md`, and `C:\Users\porat\.claude\rules\angular-rules.md`.
- Clarified that the project uses explicit Angular change detection and preserves current behavior with `ChangeDetectionStrategy.Eager`; the old strict-zoneless wording was removed from the local Angular rules.
- No architecture diagram update was needed because this was documentation and agent-rule metadata only.
- Hardened `C:\Users\porat\.claude\rules\angular-rules.md` for the local coding agent by replacing the loose prose with a strict checklist structure and removing a stale embedded task comment.
- Created user-level reusable prompt snippets for the local coding agent under `C:\Users\porat\.claude\prompts\code-agent\`, covering default work, Angular, NestJS, CSS, review, bugfix, docs update, and commit-message workflows.
- Tightened the Angular local-agent prompt after a settings-page dry run: clear scoped tasks now proceed automatically after the pre-implementation report, static pages do not need `PageStates`, and frontend verification is standardized as `npx ng build` from `frontend/`.
- Added stricter Angular Definition of Done gates to the local-agent prompt/rules and project agent guides after the settings-page dry run showed that route/build success alone was not enough to prevent broken Hebrew text and weak CSS/UI completion.
- Added an explicit static-page shell rule to the local-agent prompt/rules and project guides: static pages do not need `PageStates`, but they must still use global page shell classes instead of custom wrappers or unnecessary component CSS.
- Corrected the static-page shell rule to use `glass-effect card` for generic placeholder content and reserve `empty-state` for real empty data states.
- Tightened Hebrew safety rules after a local-agent failure reversed Hebrew strings; local agents must now copy exact approved Hebrew strings and verify them with `Select-String -SimpleMatch` instead of generating or visually reordering Hebrew.
- Rolled back the over-strict Hebrew prompt/rule additions after the user clarified Hebrew authoring is fine; retained only lightweight mojibake safeguards and kept the focus on page shell/CSS/Definition-of-Done quality gates.
- Tightened static page guidance to require copying the exact standard page shell structure because the local agent understood generic classes but still improvised the page layout.

## 2026-06-10 Explorer Terpene Flags Update

- Preserved Explorer terpene percentage labels by separating the visible terpene label from the filter value and by broadening backend Jane terpene percentage-field normalization.
- Replaced Explorer country emoji flags with local SVG assets under `frontend/public/flags` so the table renders consistent tiny flag images without a remote dependency.
- Scoped Explorer component CSS selectors under the root `.page-content` wrapper while leaving `@keyframes explorer-loader-spin` top-level.
- Deepened Explorer CSS nesting under direct UI parents while keeping the full table block out of a `p-table` wrapper to stay under the existing component CSS budget.
- Applied the Explorer CSS conventions pass locally in the component stylesheet and kept market-cell-specific button layout nested under `.market-cell`.
- Suppressed numeric zero terpene percentages during Explorer backend normalization, because Jane can send `0` for missing/default terpene percentage fields.
- Reused the global `.form-group` layout for the Explorer header search count and removed the header refresh button without adding local CSS.
- Removed the Explorer genetics connector line from origin strain to parents and kept the genetics values as independent filter buttons.
- Moved PrimeNG sort-icon overrides to global utilities to keep Explorer component CSS within budget.
- Fixed AiFormat mixed-response rendering so markdown text before or after a GenUI `component` block remains visible during skeleton streaming and after the completed component renders.
- Narrowed chat template detection to `component` fences instead of broad ` ```c ` matching, so normal code fences are not treated as GenUI.

## 2026-06-09

- Added documentation control files:
  - `documents/STATUS.md`
  - `documents/LOG.md`
  - `documents/HANDOFF.md`
- Added `documents/features/`.
- Added `documents/features/todo/`.
- Added `documents/features/incomplete/`.
- Moved active todo plans from `documents/todo/` to `documents/features/todo/`.
- Moved incomplete notes from `documents/incomplete/` to `documents/features/incomplete/`.
- Refactored `LlmService` into a facade over provider config, client runtime, model catalog, and health-check services.
- Restored and updated `documents/architecture-diagram.md` with the new LLM internal service split.
- Moved completed LLM service refactor plan to `documents/done/llm-service-refactor-plan.md`.
- Split the GenUI base prompt into focused constants under `backend/src/modules/admin-agent/constants/gen-ui/`, while keeping `GenUiSpec` and `GENUI_HTML` exported from the original path for controller compatibility.
- Replaced the split GenUI constants with the new `gen-ui.builder.ts` template builder, added global data-safety rules, removed hardcoded fallback colors, and kept `GENUI_HTML` exported from `gen-ui-spec.constant.ts`.
- Added GenUI token-safety rules that forbid `:root`, CSS variable redeclarations, global selector styling, and hardcoded design values; added approved element examples to guide generated templates.
- Added `documents/features/todo/ai-format-directive-improvement-plan.md` for frontend GenUI rendering safety and markdown cleanup.
- Strengthened GenUI visual requirements for tables, dashboards, forms, and confirmations; added a dedicated current-weather template with a giant animated weather emoji, hover states, local CSS scene, and stricter weather data rules.
- Rolled back the GenUI builder split/weather-template experiment at the user's request. The current source of truth is again `backend/src/modules/admin-agent/constants/gen-ui-spec.constant.ts`; `gen-ui.builder.ts` is absent in the current workspace.
- Verified backend build after the rollback state with `npm.cmd run build` from `backend`.
- Added `ExplorerModule` and `ExplorerController` for the existing `ExplorerService`, exposing `GET /explorer/fetch?url=...` as a protected Swagger-documented endpoint.
- Updated `documents/architecture-diagram.md` to include `ExplorerModule` and its public web page scraping dependency.
- Verified backend build after adding the Explorer module.
- Added Angular `Explorer` page under `frontend/src/app/features/explorer/`, with direct `HttpClient` access to `GET /explorer/fetch` and dynamic table rendering.
- Added `/explorer` route and sidebar navigation item.
- Updated `documents/architecture-diagram.md` with `ExplorerUI` and noted that the first version does not use a dedicated Angular service.
- Verified frontend build after adding the Explorer page.
- Replaced the Explorer scraper implementation with a focused Jane-style dynamic table flow: load page, locate product rows, click each row, wait for expanded content, extract visible and hidden strain fields, close the row, and continue.
- Explorer fetch response now documents and returns structured strain fields: `hebName`, `enName`, `parent1`, `parent2`, `originStrain`, and `countryOfOrigin`.
- Verified backend build after updating the Explorer scraper.
- Changed Explorer ownership so the source URL is fixed on the backend, `GET /explorer/fetch` has no query parameters, and the Angular Explorer page loads automatically on entry.
- Removed the Explorer URL input from the client and removed `ExplorerFetchQueryDto`.
- Verified backend and frontend builds after the Explorer URL ownership change.
- Fixed the Explorer scraper selector flow after `Waiting for selector tbody tr, [role="row"] failed`. The scraper now waits for hydrated Jane product rows using the documented `table[role="table"]` / `tbody[role="rowgroup"]` structure.
- Changed row expansion to click the product row itself and changed expanded data extraction to read label/value pairs from the details grid.
- Verified backend build after the Explorer selector fix.
- Expanded the Explorer strain payload with the selected product/commercial fields: `isNew`, `deal`, `manufacturer`, `brand`, `expiry`, `price`, `catalogPrice`, `terpenes`, and `packageType`.
- Removed redundant Explorer fields `fromPrice`, `thc`, and `cbd` from the scraper payload and response DTO.
- Verified backend build after extending the Explorer scraper payload.
- Updated the Angular Explorer page to use PrimeNG `p-table` with sortable columns, global search, Hebrew table headers, and a Hebrew page title.
- Verified frontend build after the Explorer table update.
- Reworked `ExplorerService` to consume Jane's `api/widget/products/store/tiltan/` JSON payload instead of extracting data from expanded table DOM rows.
- Added a direct Jane API request first, with a Puppeteer network-response fallback for cases where Jane blocks server-side requests with Cloudflare.
- Added optional `JANE_COOKIE` and `JANE_CSRF_TOKEN` environment support for local Jane API verification without hardcoding browser cookies in source code.
- Updated Explorer Swagger text and `documents/architecture-diagram.md` to describe the Jane API integration instead of page scraping.
- Verified backend build after replacing the Explorer DOM scraper.
- Fixed Explorer blank-state UX by starting the page in loading state, rendering visible loader text, surfacing the backend error message, and shortening the Jane browser fallback timeout.
- Verified backend and frontend builds after the Explorer loader/error fix.
- Fixed the frozen Explorer loader animation by removing the duplicate animation timing value and added explicit request timeouts in both Angular and the backend Jane direct fetch.
- Verified backend and frontend builds after the Explorer non-blocking loader fix.
- Made Explorer refresh non-blocking: clicking refresh now cancels the previous Angular request and starts a new one, instead of disabling the page while loading.
- Increased the Explorer frontend timeout to wait for the backend fallback window, while keeping backend Jane timeouts bounded.
- Fixed missing Explorer rows marked as `חדש!`; the scraper no longer treats the new-product ribbon as the Hebrew product name.
- Verified backend build after the Explorer Hebrew-name extraction fix.
- Styled the Explorer name column to match the Jane table pattern: Hebrew name, English name, review rating, and deal text are now stacked in one cell.
- Added Explorer scraper extraction for the visible row rating text and documented it in the response DTO.
- Verified backend and frontend builds after the Explorer name-cell update.

## 2026-06-10

- Moved the Explorer `isNew` indicator into the name cell as a small inline `NEW` tag.
- Fixed the new-product tag condition so it renders only when `isNew === true`.
- Verified frontend build after the Explorer new-tag update.
- Merged Explorer `price` and `catalogPrice` into one price cell: current price renders first, catalog price renders below with strikethrough.
- Kept `catalogPrice` searchable while hiding it as a standalone table column.
- Replaced Explorer package type text with icons: jar for `צנצנת`, bag for `שקית`, and package fallback for unknown values.
- Verified frontend build after the package-type icon update.
- Explorer table terpenes display update: removed `terpenes` as a standalone table column and render it as a conditional full-width row under each product.
- `terpenes` remains part of global search through embedded table fields.
- Verified frontend build after the terpenes row update.
- Removed Hebrew comments from the Explorer frontend files.
- Cleaned Explorer CSS to use project tokens instead of hardcoded colors and invalid `white-space: wrap`.
- Updated Explorer Swagger description to match the current Jane store page scraper flow.
- Verified frontend and backend builds after the Explorer cleanup.
- Compared the Explorer dark table against the Jane source table and found the missing `manufacturer` display was caused by the frontend hiding normal column values equal to `לא ידוע`.
- Updated the Explorer table fallback cell rendering to display `לא ידוע` in regular columns such as `manufacturer`, while keeping the terpenes-specific empty display behavior unchanged.
- Verified frontend build after the Explorer manufacturer display fix.
- Reviewed the Explorer strain filter flow; no code or architecture changes were made.
- Generalized Explorer UI filtering from strain-only string values to field-aware filters and made marketer metadata rows clickable filter controls.
- No architecture diagram update was needed for the local Explorer table filtering change.
- Changed Explorer table filter clicks to toggle existing field-aware filters off when the same filter is clicked again.
- Added `packageType` to the Explorer field-aware UI filters and made the package icon cell clickable.
- Added `countryOfOrigin` to the Explorer field-aware UI filters and made the country cell clickable.
- Updated `ExplorerService` to capture Jane `api/widget/products/store/tiltan/` network responses through Puppeteer while scrolling the source page, so Explorer can collect additional lazy-loaded batches instead of stopping at the initial 25 visible rows.
- Added Jane JSON normalization for the existing Explorer table shape, including marketer, manufacturer, brand, prices, expiry, parents, origin strain, country, terpenes, and package type.
- No architecture diagram update was needed because the Explorer module boundary and external Jane dependency stayed the same.
- Added `isNew` to the Explorer field-aware UI filters and made the `NEW` badge clickable.
- Added a display label to Explorer active filters so boolean-backed filters can show user-facing labels independent of their filter value.

## 2026-06-11

- Design token decision: removed the duplicate dedicated rating color token; rating UI uses the existing semantic `--color-warning` token.
- Design System decision: keep semantic status colors in a separate showcase section grouped by state, while the main palette focuses on constants, brand, surfaces, text, inputs, and glass tokens.
- Design token decision: light mode now mirrors the dark-mode glassmorphism language with teal as the primary color, while dark mode remains unchanged.
- Updated the Design System showcase CSS so color-token panels size to their own content, long token names wrap cleanly, and copy labels no longer overlap token text.
- Added global breakpoint design tokens (`--xs`, `--sm`, `--md`, `--lg`, `--xl`) to `_variables.css`, matching the documented responsive token system.
- No architecture diagram update was needed because this was local CSS/design-token maintenance only.
- Added a dedicated PrimeNG override stylesheet, imported from `frontend/src/styles.css`, and moved the existing PrimeNG datatable sort-icon overrides out of `_utilities.css`.
- Decision: future PrimeNG vendor overrides should go in `_primeng-overrides.css` instead of generic utilities or feature component styles.
- Migrated the Users management table to PrimeNG `p-table`, using the Explorer table pattern for global filtering, sortable headers, sort icons, scrollable layout, and empty-message rendering.
- Decision: Users table styling should rely on the shared PrimeNG override stylesheet rather than adding a Users component stylesheet.
- Fixed the Users search input placeholder text so it refers to users instead of chat.

- Added the full DB-backed provider/model management plan in `documents/features/todo/provider-and-llm-db-plan.md`.
- Planning decision: keep existing chat-facing LLM endpoints response-compatible while moving admin-managed provider/model definitions to DB.
- Planning decision: treat environment variables as bootstrap/fallback configuration after DB provider management is introduced.
- Planning decision: scheduled LLM model tests should run every 6 hours by default, with manual runs from Settings and persisted test results used for model ranking.
- Planning decision: Ollama installed models should remain runtime-discovered; DB stores Ollama metadata and historical test results but not installation truth.
- Added individual terpene filter buttons and country flag rendering to the Explorer table UI.
- Fixed the Explorer network-capture path so `isNew` no longer depends only on a missing Jane `is_new` JSON field; it now also maps visible `חדש!` DOM markers back to captured JSON products by Hebrew/English name.
- Completed the light-mode character upgrade by replacing only the `[data-theme="light"]` token block in `_variables.css`.
- No architecture diagram update was needed because this was global design-token styling only.
- Styling decision: LLM providers icon actions now reuse the global `icon-only` button convention instead of maintaining a component-local `.icon-btn`; the Add Model action uses the existing `transparent-btn sm` button pattern instead of a local `add-model-btn`.
- No architecture diagram update was needed because this was CSS/HTML styling only.

## 2026-07-05 — CSS Conventions Fix Closed
- Added semantic family badge tokens + logo shadow token to `_variables.css` to retire the last hardcoded hex colors and the only remaining hardcoded `rgba` in `_layout.css`'s `.logo` rule.
- Removed the duplicate hardcoded `padding: 32px` in `chat.css`'s `.chat-history` rule that was silently overriding `padding: var(--space-4)`.

## 2026-07-06 — LLM Model Test Results Retention Implemented
- Added `deleteOldTestResults(retentionDays = 30)` to `LlmProviderService` using TypeORM `LessThan` on `createdAt`.
- Added `cleanupOldLlmModelTestResults()` cron to `LlmTasksService` with `@Cron('0 0 2 * * 0')` (Sunday 02:00 server time).
- No new module imports needed — existing wiring between `LlmProviderModule`, `LlmModule`, and `LlmTasksService` already had the dependency.
- Added `llm-provider.service.spec.ts` with 5 focused tests.
- Decision: hardcode 30-day retention and Sunday 02:00 cron for version 1.

## 2026-07-18 LLM Default Model — Per-User Fix

- Removed the legacy global-per-provider `isDefault` path: deleted `LlmProviderService.setDefaultModel()` and `POST /llm-provider/models/:id/default`. The `is_default` column/entity field remains but is now dead code.
- Added `GET /llm/default-model` to `LlmController` returning the authenticated user's current default model id from `user_llm_defaults`.
- Architectural decision: `user_llm_defaults` (one row per `user_id`) is the single source of truth for the default model; `resolveEffectiveModel()` already reads it via `getUserDefaultModel()` before any legacy fallback, so the runtime resolution was already correct — only the write path and UI flag were inconsistent.
- Architectural decision: created the missing `user_llm_defaults` table directly via the existing migration SQL because `synchronize:true` only auto-creates TypeORM entities, not raw-SQL-migrated tables. Left as a manual step; a repeatable migration runner or a real entity conversion is a future open question.
- No architecture diagram update was needed: module boundaries, request flow, and the default-resolution path are unchanged; only the dead legacy flag path was removed.

## 2026-07-18 user_llm_defaults Entity + drop is_default (follow-up)

- Converted `user_llm_defaults` into a real TypeORM entity `UserLlmDefaultEntity` (unique `user_id`, `model_id` FK to `llm_models` with `onDelete: 'CASCADE'`) and registered it in `LlmProviderModule.forFeature`, so `synchronize:true` now owns the table instead of raw SQL.
- Refactored `LlmProviderService.setUserDefaultModel`/`getUserDefaultModel` to use the repository (removed the `INSERT ... ON DUPLICATE KEY UPDATE` / `SELECT model_id` raw queries).
- Removed the dead `isDefault` field from `LlmModelEntity`; under `synchronize:true` the `is_default` column was dropped from `llm_models` and verified absent.
- Added `migrations/DropLlmModelIsDefault1752860000000.ts` for portability (the project runs `synchronize:true`, so migrations are not auto-run).
- No architecture diagram update was needed: storage representation changed but the module boundaries and default-resolution data flow are identical.

## 2026-08-17 A6 — Regression sweep (stage 1 of full audit)
- tsc --noEmit: backend 0, frontend (solution/app/spec) 0×3. jest --runInBand: 381/389, 8 fails — byte-identical set to pre-commit baseline (agent-session 3, llm-client 4, swagger-parser 1) → all pre-existing, zero new regressions from last night's commits. Hook suite 92/92. `.claude`/`css-nesting-check.mjs` clean. Finding: `frontend/tsconfig.spec.new.json` is tracked + vitest-flavored — dead-config candidate (stage 3).
- Stage 2 (ServiceResultContainer audit): 76 endpoints / 15 controllers mapped → documents/audit-service-result-container.md. 56 conform (6 documented exceptions: SSE×2, 204×3, OAuth redirect×1), 3 partial, 17 non-conform (raw passthrough clusters: admin-agent sessions, calendar events, llm image/video, ideas reads, strain-hunter). Decision: no auto-wrap — ❌ fixes are breaking changes requiring coordinated frontend sweep.
- Stage 3 (dependency map): file-level import graph across backend/src → documents/audit-dependency-map.md. 11 graph cycles ALL type-level (entities/DTOs/decorators/seeds) — zero runtime DI cycles, zero forwardRef, zero orphan modules/services. Findings: dead file math.utils.ts, 16 over-exported symbols, misplaced RequiresConfirmation decorator (admin-agent owns it, llm-provider+users consume), core/seeds reach into feature entities, frontend/tsconfig.spec.new.json = dead vitest leftover. No code modified.
- Stage 4 (SearXNG engines): fresh probe 2026-08-17 — brave "too many requests", ddg CAPTCHA, qwant CAPTCHA, startpage "Suspended: CAPTCHA", mojeek responds-but-0-results, google cse NEWLY suspended "too many requests" (was the site:-honoring workhorse yesterday). Live engines = bing only (ignores site: → our post-filter is the only correctness layer). Root cause: single static egress IP (5.29.22.109, docker bridge, NO outgoing.proxies in settings.yml, image_proxy false) — every engine rate-limits the same IP. Backlog proposal: outgoing.proxies (residential/rotating socks5-http) per engine or global in settings.yml; alternative: engine rotation cooldowns or external metasearch API. Not fixed — documented as backlog.

## 2026-08-17 A7 — Audit fixes applied: 3 partial endpoints + dead-code cleanup
- confirm-action: unified to `{success, message, result}` both branches (cancel result = `{cancelled}` nested); 4 new controller tests; frontend chat.service type updated (consumer only reads `result` — backward compatible).
- ideas PATCH /ideas/:id + POST /nightly/mark-read → HTTP-204 (aligned with delete siblings; frontend already `patch<void>`/`post<void>`).
- Dead code removed: math.utils.ts (file), user-role enum backend mirror (getUserRoleData/UserRoleOptions/UserRoleDescription — frontend has its own used copy), 12 internal symbols un-exported. Net −50 lines. Deferred: tsconfig.spec.new.json, RequiresConfirmation relocation, seeds boundary.
- SearXNG recheck: google cse STILL suspended (too many requests); duckduckgo RECOVERED and honors site: (reddit-only results). Live: bing + ddg.
- Verified: backend tsc 0, frontend tsc 0×2, targeted jest 45/45 (admin-agent.controller 15 incl. 4 new, ideas ×3).

## 2026-08-17 A8 — Mojibake fix + full-codebase foreign-char scan
- chat.ts:593 fixed: 'hoặc' (Vietnamese) → 'או' in confirmPendingAction 404 message. chat.spec 23/23, tsc 0.
- Scan (503 files, Hebrew-line + foreign-char detector): 104 hits, ALL legitimate (🚀 comments, ₪, →, ⚠️/≠ inside LLM prompts). ZERO additional mojibake. One borderline: main-sidebar.html:101 'צʼאט' uses U+02BC instead of Hebrew geresh ׳ (U+05F3) — identical display, not mojibake, left as-is.
- No mojibake-scan spec exists in project (per instruction, not created).
- CORRECTION to audit-dependency-map: frontend tests run on VITEST v4.1.7 via ng test — tsconfig.spec.new.json is ACTIVE config, NOT a dead leftover. Backlog item retracted.

## 2026-08-17 A9 — Cluster 1/5: admin-agent sessions wrapped (×4)
- GET /sessions, GET /sessions/:id/messages, POST /messages/images, POST /sessions → ServiceResultContainer, wrapped in CONTROLLER (service signatures untouched — analytics/system callers unaffected; x-has-more-images header preserved).
- Frontend: chat.service unwraps via shared core/models/service-result-container.model (first pass mistakenly invented local ApiResult — user caught, fixed to shared model). Public service API unchanged → chat.store + chat.ts untouched.
- Tests: backend controller 14/14 (incl. new wrap asserts), frontend chat.service + chat 29/29, tsc 0 both sides.
- Cluster 2/5 (calendar events ×3): GET/POST/PATCH /calendar/events wrapped in ServiceResultContainer. KEY FINDING: sole consumer = the admin-agent LLM (tools execute via internal HTTP loopback to localhost:PORT with internal JWT, built from swagger operationIds) — NO frontend consumer exists. Google Schema$Event payloads preserved verbatim under result; LLM gains shape-consistency with all other tools. 3 new shape tests; calendar specs 21/21, tsc 0.
- Cluster 3/5 (llm image/video ×4): exception check per manager — NO streaming/SSE on any endpoint (all plain request/response; createVideoTaskAndWait polls internally server-side), b64Json is regular JSON (wrap adds ~50 bytes). Consumers are DUAL: frontend media-studio (via media.service) AND the LLM agent (internal HTTP tools). All 4 wrapped; frontend media.service unwraps via shared ServiceResultContainer (public API + media-studio component untouched); LLM side needs no code change (reads container JSON like every other tool). extend has NO frontend consumer at all. llm.controller 13/13, media+media-studio 15/15, tsc 0 both.

## 2026-08-17 A10 — Seeds relocated: core boundary inversion resolved
- `git mv` 4 seeds from `core/seeds/` → their feature modules (`modules/{users,terpene,genetics,llm-provider}/seeds/`); `core/seeds/` deleted. 100% renames — only relative import lines changed (feature→core import preserved for UserRole via `../../../core/enums/`).
- main.ts: seed imports repointed; removed dead `LlmModelEntity`/`LlmProviderEntity` imports (leftover of commented-out seedLlmProviders — zero usages in main.ts).
- Over-export sweep verdict: NOTHING left — audit's deferred list was exactly {decorator relocation ✓, seeds ✓, tsconfig.spec.new.json (RETRACTED — active vitest config per A8)}.
- Verified: backend tsc 0, `--runInBand` 399/399, build 0, LIVE boot (fresh dist + restart): C5 ✅, seeds idempotent vs existing DB (clean boot, no throws), :3000 serving. Frontend tsc app 0. Mojibake clean; `.claude`/css-nesting-check untouched.

## 2026-08-17 A11 — SearXNG outgoing hardening + proxy scaffolding
- Root cause (from A1 + settings.yml's own comment): single static egress IP + nightly ideas cron parallel queries → engines rotate between available/CAPTCHA with no stable pattern. Fix requires rotating proxy pool (paid infra) — decision pending user.
- Infra-independent half shipped: `outgoing` extended with doc-confirmed options only (docs.searxng.org settings_outgoing + settings_engines): `useragent_suffix`, `retries: 0` (explicit — each retry uses a DIFFERENT proxy/IP, useless+harmful with single IP), commented `proxies:` (round-robin httpx syntax) + `extra_proxy_timeout`; engine-level `retry_on_http_error: false` on bing/mojeek/qwant → blocked engines enter automatic cooldown instead of being re-hammered. No invented/undocumented keys (cooldown_time NOT set — could not confirm in docs).
- .env.example: fixed stale `ensure-searxng.sh` → `.js` reference; documented settings.yml is source of truth (SearXNG settings not env-driven) + `docker restart searxng`.
- Verified LIVE: pyyaml parse clean · container restart clean · / 200 · search e2e 20 results (bing+ddg). `.env.example` diff surgical (only web-search block; note: str_replace tool refuses dotfiles → python precision edit).
- Observed unowned change (NOT mine, untouched, flagged): `frontend/src/app/assets/styles/_filters.css` — p-slider-handle margin/border-radius/translate tweak, hardcoded `50%` vs `var(--radius-xs)`.
