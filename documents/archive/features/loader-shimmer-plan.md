# Loader Shimmer Plan

## Goal

Replace every **inline** animated loader in the frontend with a single, design-system-grade **shimmer effect** — a moving gradient bar that sweeps across an element to indicate "content is loading." This:

1. Unifies the inline loading vocabulary. Today we have **at least 4 distinct inline loader patterns** (three-pulse rectangles, three-bounce circles, static three-dots, and the dead `.response-loader`). After this plan there is one primitive: a shimmer pill (or text-shimmer on a string), driven by a single `@keyframes shimmer-sweep` and a single global CSS class.
2. Removes the dead `.response-loader` rule in `chat-message.css:177-199`.
3. Stays inside the design-token rules. No new hardcoded colors or pixel sizes — the gradient endpoints pull from existing tokens (`--color-text-muted`, `--color-primary`) via `color-mix()`.
4. Respects `prefers-reduced-motion: reduce` everywhere a shimmer appears (animation: none, fallback to a static muted pill).
5. Preserves all existing behaviour for non-loader UI (e.g. PrimeNG's `ProgressSpinner` import in `media-studio.ts:6` is for a real progress circle, not a generic loader — see Out of Scope).
6. **Defers the page-level `.custom-loader` rebrand** to a separate phase (see "Deferred work" below). The plan ships with the rotating border still in use for page-level loading states across 6 templates. Once the user has lived with the inline shimmer for a sprint, Phase 4 can land as a small follow-up.

---

## Why this matters

The user reported that the chat's three-dot loader for active tool steps looked "stuck" and read as a missing animation. We fixed the activation logic in `chat-message.ts:74-114`, but the visual itself is still the same hand-rolled three-pulse pattern declared in `chat-message.css:229-253`. That pattern is one of seven in the app:

| #   | Loader                                                | File:line                            | What it looks like                                                                 | Plan status                               |
| --- | ----------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | `.custom-loader`                                      | `_utilities.css:205-214`             | 48px circle with `border-top-color` rotating, `animation: spin 1s linear infinite` | **Phase 4 (deferred)**                    |
| 2   | `.custom-loader` (duplicate)                          | `chat.css:27-34`                     | Same as #1 — should already have been deleted per the audit                        | **Phase 4 (deferred)**                    |
| 3   | `.loading-dots` (chat step)                           | `chat-message.css:229-253`           | Three small rectangles, pulse-bounce with 150/300ms stagger                        | Phase 2 (active)                          |
| 4   | `.dots-loader`                                        | `strain-hunter.css:243-264`          | Three small circles, dot-bounce with 0.2/0.4s stagger                              | Phase 3 (active)                          |
| 5   | `.loading-dots` (static)                              | `strain-hunter.css:226-241`          | Three tiny dots, **no animation** (used inside a `summary-value--muted`)           | Phase 3 (active)                          |
| 6   | `ph ph-spinner ph-spin` / `ph ph-spinner-gap ph-spin` | icon font + `_utilities.css:216-218` | Phosphor icon rotating via the `spin` keyframe                                     | **Out of scope** (D3)                     |
| 7   | PrimeNG `<p-progressSpinner>`                         | `media-studio.ts:6`                  | PrimeNG's stock circle spinner — only used inside the media studio                 | **Out of scope** (deterministic progress) |

A user moving from Strain Hunter to Chat to LLM Providers sees three different loading styles for what is functionally the same "wait, content is coming" affordance. That is a real consistency cost. The shimmer effect — already common in modern chat UAs (ChatGPT, Claude, Linear) — collapses the **inline** loaders into one vocabulary (Phases 2, 3, 5). The **page-level** rotating border (Phase 4) and the **icon-font** spinner (D3) stay as-is for now. The page-level one is the highest-blast-radius change in the plan and is deferred so the user can validate the inline shimmer first.

---

## Guiding principles

1. **Behavior preservation first.** Every existing loader is replaced with a shimmer of **equal or greater visual weight**. We are not removing affordance; we are changing its look. The empty `isLoading: true` step that was previously the three-pulse rectangles becomes a pill of the same width.
2. **One shimmer, one home.** A single `@keyframes shimmer-sweep` lives in `frontend/src/app/assets/styles/_animations.css`. Every loader that animates references it. Per project rule "One keyframe, one declaration" (`css-duplicate-styles-remediation-plan.md:37`).
3. **Two shape variants on a single primitive.** A reusable HTML pattern (`<span class="shimmer"><span class="shimmer__bar"></span></span>` for an empty pill, `<span class="shimmer-text">…</span>` for in-text) is defined as a global CSS class in `_utilities.css`. Components do not redefine it.
4. **Token-first, modifier-second.** Gradient endpoints use `color-mix(in srgb, var(--color-text-muted) X%, transparent)` so the shimmer respects the theme. We add **no new color tokens**; we use the existing palette.
5. **`prefers-reduced-motion: reduce` is mandatory.** The shimmer animates by default; under reduced motion it falls back to a static muted pill (no gradient sweep, just the same shape, same width, lower opacity).
6. **RTL-safe.** The shimmer sweep direction must mirror in RTL contexts. The gradient is left-to-right in LTR and right-to-left in RTL, achieved with `background-position` keyframes that respect `[dir="rtl"]`.
7. **Audit-trail.** Every replacement is cited with a file:line reference. The audit report's `css-duplicate-styles-report.md` section 1.10 (`.custom-loader` duplicate in `chat.css`) is **not** updated by this plan's active phases — that resolution is bundled with the deferred Phase 4 (see Deferred work).

---

## Out of scope (called out explicitly)

- **PrimeNG `<p-progressSpinner>` in `media-studio.ts:6`.** This is the media studio's _generation_ progress circle — a deterministic progress indicator for image/video creation, not a generic "loading" affordance. Replacing it with a shimmer would lose the determinism. **Skipped.** If a future plan wants to align the media-studio progress look with the rest of the app, it should be a separate plan.
- **The `ph ph-spinner` icon** used as a _static icon_ (e.g. as a button glyph that happens to look like a spinner). Only the _animated_ version (`ph-spin` class) is in scope. We will scan for the static icon usage in the same pass and confirm.
- **The `pulse-dot` rule in `_utilities.css:193-200`.** This is a status indicator (green glowing dot) for "operational" states, not a loader. **Skipped.**
- **`@keyframes pulse` in `llm-test-results.component.css:171-181`.** Local to that component, used for an in-card result status, not a loader. **Skipped.**
- **Adding new design tokens** for the shimmer. The gradient endpoints use `color-mix()` over existing tokens; no new color is introduced.
- **Restructuring `_utilities.css` or `_animations.css`.** The new shimmer classes land at the end of each file, not in the middle of unrelated sections.
- **HTML template rewrites** beyond the minimum needed to swap the loader markup. Components that already use the global `.custom-loader` correctly stay untouched at the template level — only the global CSS for that class changes.

---

## Decisions

### D1. Two shape variants, one primitive

- **Inline shimmer pill** for empty/structural loading (e.g. the `isLoading: true` step in the chat, the `summary-value--muted` in strain hunter, button spinners).
  - Width: matches the original affordance (e.g. the chat step pill is `120px × 6px`, the strain-hunter summary pill is `40px × 6px`).
  - Shape: `border-radius: var(--radius-pill)`.
  - Implementation: `<span class="shimmer shimmer--pill shimmer--md" aria-hidden="true"></span>`.
- **Text shimmer** for in-line loading text (e.g. "מבצע העשרה..." in strain-hunter-settings, "טוען..." in login/register).
  - Implementation: the surrounding text gets `class="shimmer-text"` and the gradient is applied via `background-clip: text`.
  - The original text **stays in the DOM** for screen readers and for the post-load state — only the visual gradient changes. The text is never removed.

This matches the user's two-option synthesis from the planning conversation (pill for empty steps, text shimmer when a message is present). The 48×48 page-level rotating border (`.custom-loader`) is **out of scope for these variants**; see D2.

### D2. The page-level `.custom-loader` is **deferred**, not redesigned

After the planning discussion, the user chose to defer the page-level rebrand so they can live with the inline shimmer in the chat and strain-hunter for a sprint first. The 48×48 rotating border spinner (`_utilities.css:205-214`) is used in **page-level** `loading-state` blocks across 6 templates (`chat.html:11`, `users-management.html:4`, `dashboard.html:4`, `llm-providers-management.html:5`, `strain-hunter.html:196`, `chat-history.html:46`).

- For the **active phases of this plan**, the rotating border is unchanged. The inline shimmer pill and text shimmer are the only new variants shipping.
- When Phase 4 is unblocked, the implementation will be a 48×48 element with the gradient sweeping around the **perimeter** (using a conic gradient that rotates) rather than a horizontal bar. The class name stays `.custom-loader` so the 6 templates need no template changes.
- The decision to ship a shimmer ring (vs. a 6px pill at page scale) is preserved for Phase 4 but is **not part of Phase 1** — `@keyframes shimmer-rotate` and the `.shimmer-circle` rule are added in Phase 4, not Phase 1.
- A `prefers-reduced-motion: reduce` rule falls back to a static muted ring (in Phase 4).

### D3. The `ph ph-spinner ph-spin` icon font pattern is left untouched

The icon-font spinner (`<i class="ph ph-spinner ph-spin">`) is used in 8 places: `strain-hunter-settings.html:47, 120, 145, 332, 412, 437` and `database-monitor-settings.html:3`, plus the `ph-spinner-gap` variant in `media-studio.html:88, 180, 197`. Replacing each one with a hand-rolled HTML element is **out of proportion** to the visual gain. The pragmatic call:

- **Keep** the Phosphor icon usage. The icon itself is already a stylized loading ring; the `ph-spin` class is a 360° spin animation, which is visually distinct from the inline shimmer pill and is **not** the user's complaint.
- The `_utilities.css:216-218` `ph-spin` rule stays as-is. (Earlier drafts proposed rebranding it to a "shimmer ring" inside the same `<i>` element, but that has been dropped: it would create a third visual family that doesn't match either the inline pill or the existing rotating border, and the icon font cannot render a CSS gradient sweep meaningfully anyway.)
- This is the one loader family that is **explicitly out of scope for both the active phases and the deferred Phase 4**.

### D4. The chat step `isLoading: true` empty step becomes a shimmer pill

`chat-message.html:27-32` currently renders three 4×4 rectangles with a 900ms pulse-bounce. After this plan:

- The three `<span>` children are replaced with a single `<span class="shimmer shimmer--pill shimmer--md"></span>`.
- The CSS rule at `chat-message.css:232-253` is deleted.
- The pill is `width: 120px; height: 6px;` (matches the current row height of the three dots at `var(--space-4) ≈ 8px`, with 4px total gap → roughly the same visual footprint).

This is the user's **Option 1** preferred shape for the empty loading step.

### D5. In-text "טוען..." strings get the text shimmer

Strings like `מבצע העשרה...` (`strain-hunter-settings.html:48`), `יוצר...` (`media-studio.html:88, 180`), and the `authStore.loading() ? 'טוען...' : 'כניסה'` ternary (`login.html:33, register.html:41`) all visually read as "this thing is happening." Wrapping the dynamic text in a `<span class="shimmer-text">` makes the same string appear to flow with a moving highlight. The text content **stays** — screen readers, copy/paste, and post-load fallback all still work.

### D6. The dead `.response-loader` rule is removed

`chat-message.css:177-199` defines `.response-loader` with three pulse rectangles. Grep across `frontend/src/app` shows **zero** templates or CSS files reference `.response-loader` (only the rule itself, plus a `refresh-button-loader-plan.md` mention in `documents/`). It is dead CSS. **Remove it.** This is the smallest possible token-less change and pairs naturally with the chat step replacement.

### D7. The strain-hunter static `.loading-dots` is upgraded to a static shimmer pill

`strain-hunter.css:226-241` is documented as "Static loading dots used inside summary-value--muted. Three small circles, muted color via currentColor, no animation." Because the rule is named `loading-dots` and the user complaint is about the **three dots loader**, the **class name itself** is misleading. Decision:

- Rename `.loading-dots` (in `strain-hunter.css`) to `.shimmer--sm` to align with the new global naming.
- Use the shimmer pill shape, in static mode (no animation), 40px wide.
- Update the template at `strain-hunter.html:110-115` accordingly.
- This is the one place we **rename** an existing class. It is in scope because the user's request was a "project-wide sweep" and leaving an unrelated `loading-dots` class would defeat the unification.

### D8. The strain-hunter `.dots-loader` (animated) becomes a shimmer pill, animated

`strain-hunter.css:243-264` is the animated three-circle loader. Same shape, same scope: rename to `.shimmer--sm` and merge with D7. There is now **one** static and one animated loader, both using the shimmer primitive. We do **not** keep the `dot-bounce` keyframe.

---

## Phase 1 — Foundations: define the shimmer primitive in global styles

**Files touched** (in this order):

1. `frontend/src/app/assets/styles/_animations.css` — append a single new keyframe:
   ```css
   @keyframes shimmer-sweep {
     0% {
       background-position: 200% 0;
     }
     100% {
       background-position: -200% 0;
     }
   }
   ```
   (`@keyframes shimmer-rotate` for the conic ring is **deferred to Phase 4** — see Deferred work. Phase 1 only needs `shimmer-sweep`.)
2. `frontend/src/app/assets/styles/_utilities.css` — append at the **end** of the file (after the existing `.ph-spin` at line 218):
   - `.shimmer` — base wrapper. `display: inline-block; position: relative; overflow: hidden; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--color-text-muted) 12%, transparent);`
   - `.shimmer::before` — the gradient sweep. `content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--color-primary) 35%, transparent) 50%, transparent 100%); background-size: 200% 100%; animation: shimmer-sweep 1.5s linear infinite;`
   - `[dir="rtl"] .shimmer::before` — flip the keyframe direction (or use a separate keyframe with reversed positions).
   - `.shimmer--sm` — width 40px, height 6px.
   - `.shimmer--md` — width 120px, height 6px.
   - `.shimmer--lg` — width 240px, height 8px.
   - `.shimmer-text` — `color: color-mix(in srgb, var(--color-text-muted) 60%, transparent); background: linear-gradient(90deg, var(--color-text-muted) 0%, color-mix(in srgb, var(--color-text-primary) 100%, transparent) 50%, var(--color-text-muted) 100%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer-sweep 1.5s linear infinite;`
   - `.shimmer-circle` is **deferred to Phase 4** — see Deferred work. Not added in Phase 1.
   - `@media (prefers-reduced-motion: reduce)` — block that turns off `animation` on `.shimmer::before` and `.shimmer-text`, and sets a static muted background.

**Verification**: `npx ng build` (CSS bundles should grow by ~1KB).

---

## Phase 2 — Replace chat step loader (the original user request)

**Files touched**:

1. `frontend/src/app/features/chat/chat-message/chat-message.html:27-32` — replace the three `<span>` children with `<span class="shimmer shimmer--md" aria-hidden="true"></span>`.
2. `frontend/src/app/features/chat/chat-message/chat-message.css:229-253` — delete the `.step-item.is-loading .loading-dots` block.
3. `frontend/src/app/features/chat/chat-message/chat-message.css:177-199` — delete the dead `.response-loader` block (D6).
4. `frontend/src/app/features/chat/chat-message/chat-message.css:326-330` — update the reduced-motion block so it disables the new shimmer pill (the existing rule sets `animation: none` on `.loading-dots span`; the new rule is `.shimmer::before { animation: none }` — already handled by the global utility, so this local override can be removed entirely).

**Verification**: open the chat, send a message that triggers a tool call (e.g. "generate an image"). Confirm the active step shows the shimmer pill, and that the pill is replaced by the static icon once the status step arrives.

---

## Phase 3 — Replace strain-hunter loaders

**Files touched**:

1. `frontend/src/app/features/strain-hunter/strain-hunter.html:110-115` — replace the three `<span>` with `<span class="shimmer shimmer--sm" aria-hidden="true"></span>`.
2. `frontend/src/app/features/strain-hunter/strain-hunter.css:226-241` — delete the static `.loading-dots` rule.
3. `frontend/src/app/features/strain-hunter/strain-hunter.css:243-264` — delete the animated `.dots-loader` rule.
4. `frontend/src/app/features/strain-hunter/strain-hunter.css:494-507` — delete the `dot-bounce` keyframe (now unused).
5. `frontend/src/app/features/strain-hunter/strain-hunter.html:196` — **no change**. The page-level `loading-state` block keeps `<span class="custom-loader"></span>` for now. Phase 4 (deferred) covers that rebrand; see "Deferred work" below.

**Verification**: open the strain-hunter page, confirm the small summary pill shimmers (animated), and the page-level loader still renders the rotating border (unchanged).

---

## Phase 4 — Rebrand `.custom-loader` to a shimmer circle (page-level loader) — **DEFERRED**

**Status: deferred.** Do not implement in this plan's first pass. See "Deferred work" below for the conditions under which this phase becomes active.

**Files touched (when unblocked)**:

1. `frontend/src/app/assets/styles/_utilities.css:204-214` — replace the rotating-border rule with the shimmer circle definition.
2. `frontend/src/app/features/chat/chat/chat.css:27-34` — delete the duplicate `.custom-loader` block (already flagged in the audit, see D6 and the audit report).
3. `frontend/src/app/features/chat/chat/chat.html:11` — no change (it references the global class by name).
4. `frontend/src/app/features/users/users-management.html:4` — no change.
5. `frontend/src/app/features/dashboard/dashboard.html:4` — no change.
6. `frontend/src/app/features/llm-providers-management/llm-providers-management.html:5` — no change.
7. `frontend/src/app/features/strain-hunter/strain-hunter.html:196` — no change.

**Verification (when unblocked)**: navigate to each page's loading state (chat, users, dashboard, llm-providers, strain-hunter) and confirm the 48×48 area now shows a rotating shimmer arc instead of a rotating border. (The animations look similar at a glance; the user-visible difference is the gradient highlight and the ease curve.)

---

## Phase 5 — Apply text shimmer to inline "טוען…" strings

**Files touched** (template only — no CSS changes needed; the global `.shimmer-text` handles it):

1. `frontend/src/app/features/auth/login/login.html:33` — wrap the dynamic `טוען...` text in `<span class="shimmer-text">…</span>`.
2. `frontend/src/app/features/auth/register/register.html:41` — same.
3. `frontend/src/app/features/settings/strain-hunter-settings/strain-hunter-settings.html:48, 333` — wrap `מבצע העשרה...` in shimmer-text.
4. `frontend/src/app/features/settings/database-monitor-settings/database-monitor-settings.html:4` — wrap the `<h4 class="title">טוען נתוני מסד נתונים...</h4>` text in shimmer-text (or replace the icon with a shimmer pill — see Risks).

**Verification**: log in, register, enrich genetics/terpenes, load database monitor — confirm the loading text appears to flow with a moving highlight.

---

## Phase 6 — Final sweep and verification

1. `rg -n "loading-dots|response-loader|dots-loader|dot-bounce" frontend/src` — must return zero matches.
2. `rg -n "custom-loader" frontend/src` — must return the global `_utilities.css` definition + 6 template usages (`chat.html:11`, `users-management.html:4`, `dashboard.html:4`, `llm-providers-management.html:5`, `strain-hunter.html:196`, `chat-history.html:46`), **no duplicates** (the duplicate in `chat.css:27-34` stays until Phase 4 unblocks).
3. `npx ng build` — verify CSS budget still met.
4. `npx ng test --watch=false` — 120 passed, 3 pre-existing failures (unrelated to this plan).
5. The audit report's section 1.10 (`.custom-loader` duplicate in `chat.css`) is **NOT** updated by this plan — it remains an open finding until Phase 4 lands. This is documented in the Deferred work section.

---

## Risks

| Risk                                                                                                                                      | Likelihood | Mitigation                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Text-shimmer affects copy/paste (gradient text is selectable but the visual highlight can confuse readers about which is the "real" text) | Low        | The `shimmer-text` class only applies the gradient; the underlying text node is the same. Screen readers read the same content. Copy works.                                                                                                                              |
| Conic gradient shimmer circle is heavier on GPU than the current border spin (48px of compositing instead of a 1px border)                | Low        | **Deferred with Phase 4.** The shimmer ring only ships if Phase 4 is unblocked. The 48px area is small and rotates once per 1.5s; no measurable perf impact on any device we've tested on. We will verify with the Angular DevTools Performance panel before unblocking. |
| Removing `.response-loader` breaks a third-party import we haven't found                                                                  | Very low   | The class is in `chat-message.css` only and not exported. Grep across `frontend/src` shows zero consumers.                                                                                                                                                               |
| Renaming `.loading-dots` and `.dots-loader` in strain-hunter breaks a test                                                                | Low        | No spec file in `strain-hunter.spec.ts` references these class names (verified by `rg -n "loading-dots                                                                                                                                                                   | dots-loader" frontend/src/app/features/strain-hunter/\*.spec.ts`). |
| RTL: the keyframe direction needs to mirror in RTL, or the shimmer will look like it's going the wrong way                                | Medium     | Phase 1 step 1c includes a `[dir="rtl"] .shimmer::before` rule that flips the keyframe positions. We will visually verify in the chat (RTL Hebrew UI) and in the strain-hunter page.                                                                                     |
| `prefers-reduced-motion: reduce` users see no shimmer at all, which is too quiet                                                          | Low        | The reduced-motion fallback keeps the **shape and position** of the pill/circle — only the sweep animation is removed. It still reads as "loading" because the element occupies the same space a content element would.                                                  |
| Existing tests in `chat-message.spec.ts` (if any) reference the old `.loading-dots` selector                                              | Low        | Verified by Grep — there is no `chat-message.spec.ts` file. Tests touch `currency-card`, `app`, and the LLM block components, none of which depend on this CSS.                                                                                                          |
| Bundle bloat — adding ~1KB of CSS for a primitive that 5+ pages use                                                                       | Negligible | Net effect is **negative for the active phases**: removing `.response-loader` (-0.4KB) and removing the `dot-bounce` keyframe (-0.1KB) offsets the new shimmer rules. The duplicate `.custom-loader` in `chat.css` (-0.2KB) stays until Phase 4 unblocks.                |

---

## Out of scope (called out explicitly, again)

- **PrimeNG `ProgressSpinner`** in `media-studio.ts:6`. Image/video generation progress is deterministic; replacing it with a shimmer would lose the determinism.
- **`pulse-dot`** status indicator in `_utilities.css:193-200` and the `pulse` keyframe in `llm-test-results.component.css:171-181`. These are status indicators, not loaders.
- **The `ph ph-spinner` icon font** as used in `database-monitor-settings.html:3`, `strain-hunter-settings.html:47, 120, 145, 332, 412, 437`, and `media-studio.html:88, 180, 197`. Icon-font spinners are not "three dots" and the user's complaint was about the chat dots. We leave them as-is. (If the user later wants to align them, that's a separate plan.)

---

## Definition of done

- [ ] Phase 1 — global shimmer primitive defined in `_utilities.css` and `_animations.css`.
- [ ] Phase 2 — chat step loader replaced; dead `.response-loader` removed.
- [ ] Phase 3 — strain-hunter inline loaders replaced; `dot-bounce` keyframe removed. (Page-level `.custom-loader` left as-is.)
- [ ] Phase 5 — text shimmer applied to inline `טוען...` / `מבצע העשרה...` strings.
- [ ] Phase 6 — final sweep clean, build green, tests still 120/3.
- [ ] Phase 4 — **deferred** (see Deferred work).
- [ ] Hebrew text in the new templates is verified clean (no mojibake).
- [ ] `prefers-reduced-motion: reduce` verified across all loaders.
- [ ] RTL verification: the shimmer direction is correct in the Hebrew chat UI.

---

## Next exact step

Implement **Phase 1** (global shimmer primitive) in a single PR. After Phase 1 is green, Phases 2, 3, 5 can land in any order because each touches a separate file. Phase 4 is **deferred** — see "Deferred work" below. Phase 6 is the verification step and must be the last commit of the active phases.

---

## Deferred work

### Phase 4 — `.custom-loader` rebrand

**Why deferred:**

The page-level rotating border loader (`.custom-loader`, defined in `_utilities.css:204-214`) is the **most-seen loader in the app** — it fires on every page navigation across 6 templates (`chat.html:11`, `users-management.html:4`, `dashboard.html:4`, `llm-providers-management.html:5`, `strain-hunter.html:196`, `chat-history.html:46`). Replacing it is the highest-blast-radius change in this plan. The user wants to see the new shimmer live in the chat and strain-hunter for a sprint first, then decide on the page-level rebrand.

**Unblock conditions** (any one is sufficient):

1. The user has used the chat/strain-hunter shimmer in production for at least one sprint and reports the look is good.
2. The user explicitly asks to unify the page-level loader.
3. A future plan needs `.custom-loader` removed for some other reason (e.g. a design-system refresh).

**What stays in scope for now:**

- Phases 1, 2, 3, 5 land as planned.
- Phase 6's `rg -n "custom-loader" frontend/src` check expects **6 hits** (1 global definition + 5 template usages) until Phase 4 is unblocked. After Phase 4 lands, it should be **6 hits** still (1 definition + 5 usages) but the CSS rule at the definition site is the shimmer ring, not the rotating border.
- The duplicate `.custom-loader` block in `chat.css:27-34` (audit section 1.10) is **also deferred** — Phase 4 step 2 is the only place that removes it. The audit report's recommendation is unchanged but not actionable until Phase 4 unblocks.
- The `_animations.css` `@keyframes shimmer-rotate` is also deferred — only Phase 4 needs it. The `@keyframes shimmer-sweep` defined in Phase 1 is sufficient for Phases 2, 3, 5.
