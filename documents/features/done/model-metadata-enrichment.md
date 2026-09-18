# Model Metadata Enrichment — auto-detect context/pricing ✅ DONE (2026-09-18, uncommitted)

**Result:** backend + frontend complete and verified (639/639 frontend tests, 595/599 backend
full-suite with the 4 failures proven pre-existing on `main`, both builds exit 0). Branch
`feat/model-metadata-enrichment`. **Live smoke skipped by user decision** (unit coverage of the
catalog matcher is exhaustive — 20/20 against the real 445-entry payload); the user verified the
Auto-Detect UX live in the UI before the redesign request.

## UI redesign (user request, 2026-09-18)

The first dialog rendered as a long vertical form. Restructured to the compact card the user
specified: one bordered `specs-card` (token-tinted surface), `Model Specifications` mini-title,
two 2-col grids (Context + Max Output, then Prompt + Completion), and the **Free Tier checkbox
moved into the pricing header**. Checking it zeroes the prices AND `disable()`s the inputs
(reactive-form idiom, no `[disabled]` in the template — avoids the Angular console warning);
`getRawValue()` still carries the 0s to the backend. Unchecking re-enables. Both badges now use
`formatContext` (131072 → 128K, 8192 → 8K).

**Bug found and fixed via the redesign:** the checkbox originally carried
`(ngModelChange)` alongside `formControlName` while the handler `setValue()`d the same control —
PrimeNG's `writeValue` re-fires the output, recursing until `RangeError: Maximum call stack size
exceeded`. It surfaced only as **25 unhandled RangeErrors** (tests still passed — vitest reports
those as warnings). Switched to `(onChange)` (DOM-only emission; verified in PrimeNG source that
`writeValue` never emits it). Correlation measured: **0 errors with `(onChange)` vs 37 with the
old wiring**. A DOM-level regression test renders the dialog and toggles the checkbox through
`document.querySelector('#model-free-tier')`. Baseline run (my changes stashed) was 614/614 with
zero unhandled errors — so both the failure and the warnings were mine, not pre-existing.

**Second bug — the whole redesign silently did not render (Golden Rule #8).** The user's original
five visual complaints (glued `Specs & Pricingper 1M tokens` label, vertical stacking, floating
checkbox, stray Auto-Detect button) all traced to ONE root cause: the CSS was written in
`llm-providers-management.css` (component-emulated), but `p-dialog` projects its content to
`<body>`, so the `[_ngcontent]` scoping never matched the projected nodes. The classes that DID
work in the same dialog were all global (`_forms.css` / `_buttons.css`) — that asymmetry was the
tell. **Fix:** moved `.specs-card`, `.key-field-with-detect`, `.detect-btn`, `.input-with-badge`
into the existing `.p-dialog { … }` section of `_primeng-overrides.css`, beside the sync-models
dialog styles (already there for this exact reason), and gave `.free-tier-toggle .p-checkbox`
the same 16px sizing as the sync checkboxes. **Proven in compiled output:** `styles-*.css` now
carries those selectors as unscoped global rules; before the move they were scoped and dead.
Gate lesson: after any dialog markup change, grep the compiled CSS for the new selectors WITHOUT
`[_ngcontent]` — that is the only proof the styles reach the projected DOM.

**Plan** enrich `llm_models` with `context_length`, `max_output_tokens`, `prompt_price_per_m`, `completion_price_per_m` (+ free-tier) auto-detected from public catalogs — **inline at Sync (the 95% entry path), inline at Seeds, manual `✨ Auto-Detect` in Edit Model**. Never blocks writes; never invents pricing.

## Locked decisions (user 2026-09-18)

| Topic | Decision |
| --- | --- |
| When at Sync | **Inline, after `syncProviderModels` creates the models** — one in-memory map lookup per key (~µs), zero network per model, no queue/cron. Table shows filled fields the moment sync ends |
| Edit Model | **`✨ Auto-Detect` button (free click)**; **fields stay manually editable/overrideable** (a provider can price differently than the global catalog); re-detect works after a key edit |
| Seeds | **Enriched too** — pass the seed model list through the same enrichment before DB insert; idempotent, dev/new-DB boots land filled |
| Shared service | **NEW `model-metadata-catalog.service.ts`** — single `enrichModelMetadata(keys)` used by Sync + Seeds + detect endpoint |
| Catalog source (v1) | **OpenRouter `GET /api/v1/models` only** (public, no key) — one fetch, cached in-memory (TTL ~6h). **LiteLLM JSON deferred to Phase 2** (a ~1-2MB static file in-repo for coverage gain we don't yet have evidence we need). *Open item — veto welcome.* |
| Free tier | OpenRouter `:free` variant / `0` pricing → `free_tier` boolean |
| Prices stored | **per-1M-token** (matches display across stats + dialog); converted ×1e6 at ingest |
| `0` vs unknown | **`prompt_price_per_m`/`completion_price_per_m` NULLABLE** — free = `0`, unknown = NULL (UI shows `—`) |
| Unknown / no match | **Best-effort, never throws** — fields stay NULL, sync/create succeed; a catalog fetch failure is caught and logged |

## Empirical verification (2026-09-18, live catalog — data-first)

Fetched `https://openrouter.ai/api/v1/models` (public, **445 models**, no key) and ran a
matching simulation against **all 82 model keys in the live DB** (17 providers):

- **63/82 = 77% matched, 0 ambiguity**: T1 exact 34 · T2 single bare-name 22 · T2 steered 7.
- **19 misses**: 6 legit (5 custom `agnes-*` + `OmniRoute/auto/best-free` — genuinely no public data) ·
  13 niche/renamed (atria, nararouter specials, NVIDIA NIM `nemotron-3.5-lightning-30b-a3b`,
  `qwen3.8-omni-flash`, dated aliases like `mistral-large-2512`, `gemini-3.1-pro`) — honest `NULL`.

**Real payload findings that change the design:**
1. **`~` is 18/18 a PREFIX ("auto-latest" redirect rows**, e.g. `~deepseek/deepseek-pro-latest` with
   `alias_target.slug = deepseek/deepseek-v4-pro-0813`). Measured: **zero infix `~nitro` style ids**
   exist in the current catalog. Consequences: build the bare-name index from each entry's **own `id`
   only** (alias slugs duplicate the real entry and inflate ambiguity 2-3×); normalize strips a leading
   `~`. **Rejected:** `key.split('~')[0]` — on prefix-`~` ids it yields an empty string (wrong direction).
2. **`-free` suffix variant exists** (`nararouter …/ling-3.0-flash-fin-free`) → normalize uses
   `key.replace(/[-:]free$/i, '')` — closes `:free` and `-free` in one regex (user's tip, adopted).
3. **Both `vendor/model` and `vendor/model:free` exist as separate entries** → **`:free`-steering**:
   local key is free → prefer the `:free` variant; otherwise prefer the base; vendor-hint as last resort.
4. **`pricing` carries `input_cache_read`/`input_cache_write` and time-windowed `overrides`
   (utc_start/utc_end — e.g. day vs night rates)**. Decision: store **base** `pricing.prompt/completion`
   (×1e6); ignore `overrides` (documented).
5. `context_length` is the **top-level** value (routed, the number that governs truncation);
   `top_provider.context_length` is the upstream provider's own — use top-level.
   `top_provider.max_completion_tokens` is the max-output source.

## Key matching — NORMALIZED, TWO-TIER (empirically tuned)

`normalizeKey`: lowercase · trim · strip leading `~` · strip trailing `[-:]free` (`key.replace(/[-:]free$/i, '')`).

- **Tier 1 — exact:** normalized key == catalog `id` (our `<provider> / …` prefix is stripped at
  sync-time before enrichment; `openrouter/…`, `xkiro/…` style prefixes must be peeled first).
- **Tier 2 — bare-name, indexed from `id` only:** last path segment equality. Multiple candidates →
  **`:free`-steering** (local `:free`/`-free` prefers the `:free` catalog entry, else the base), then
  vendor-hint (pre-`/` segment), else **NULL** — never guess a price.

## Content mapping (OpenRouter v1)

| Field | Source |
| --- | --- |
| `context_length` | resp `context_length` |
| `max_output_tokens` | `top_provider.max_completion_tokens` (fallback: `max_completion_tokens` if present) |
| `prompt_price_per_m` | `pricing.prompt` × 1e6 (string → number) |
| `completion_price_per_m` | `pricing.completion` × 1e6 |
| `free_tier` | `:free` suffix OR prompt+completion == 0 |

## UI presentation (user spec, 3 surfaces — zero added table width)

**Format helpers (shared, frontend):**
- `formatContext(n)`: `<1M → ${Math.round(n/1024)}K` (8192→8K, 131072→128K); `≥1M → ${1-decimal}M` (1048576→1M).
- `formatPrice(n, isFree)`: free/0 → `Free` (green); else `$X.XX` (2 decimals).

1. **Edit Model dialog — "Specs & Pricing" section** (below Capability),
   MtMapper fields editable (manual override always wins; a provider prices itself differently):
   - **Context Window** — number input + smart badge (`131,072` → `128K`).
   - **Prompt ($/1M)** / **Completion ($/1M)** — number inputs.
   - **Free Tier** — glowing green checkbox that **zeroes the prices** (toggle on → 0s; off → editable again).
   - **`✨ Auto-Detect` button** beside Key + **`Detect again`** — refreshes from the catalog; fills all fields.
   - **Source badge**: `✨ Enriched via OpenRouter (T1 Exact)` / `(T2 Bare)` — persisted in `metadata_source`
     so it survives reopening; result of a detect with no hit → info toast "לא נמצאו נתונים — ממלאים ידנית".
2. **Provider models table** — **micro-badges under the model name inside the existing Model column**
   (no new columns, no width growth): `<model label>` / `<key>` / 🏷️ `128K ctx · Free · Max Out: 8K`
   or 🏷️ `128K ctx · $2.00/$6.00 (1M)` · missing → no badges.
3. **Chat model picker** (`p-tiered-menu` subs) — next to the name, grey small text:
   `<128K · Free>` or `<64K · $0.14/M>` (prompt price). Real user value: pick an adequate context
   **before** sending a giant doc / long task.

## Files

**Backend**
- `entities/llm-model.entity.ts` — +4 nullable columns (context int, maxOutput int, `double` prices, `free_tier` boolean default false).
- NEW `llm-provider/services/model-metadata-catalog.service.ts` + `.spec.ts` — OpenRouter fetch+cache, normalize, tier-1/tier-2 matcher, `enrichModelMetadata(keys: string[])`.
- NEW static fixture of the OpenRouter catalog for tests (trimmed).
- `llm-provider.service.ts` — Sync: after save, `enrichModelMetadata(toAdd.map(key))`, persist filled rows. `detectModelMetadata(key)` public (single-key, refreshes on cache miss).
- `seeds/llm-providers.seed.ts` — run seed models through enrichment before insert.
- `llm-provider.controller.ts` — NEW `POST /llm-provider/models/detect-metadata {key}` (AdminGuard, swagger, `HIDDEN_FROM_LLM` — diagnostic noise for the agent).
- `dto/create-llm-model.dto.ts` + `update-llm-model.dto.ts` — accept the 5 new optional fields.
- `llm-provider.module.ts` — register catalog service.

**Frontend**
- `core/services/llm-provider.service.ts` — `detectModelMetadata(key)`, model interface + new fields.
- `llm-providers-management.ts|html|css` — Edit/Add dialog: `✨ Auto-Detect` button beside Key → fills Ctx / Max Output / Prompt / Completion / Free-tier; fields editable; NULL renders `—`; success toast, no-match → info ("לא נמצאו נתונים — ממלאים ידנית").
- `llm-providers-management.spec.ts` — dialog detect flow + manual override preserved.

## Verification (gate) — ✅ all passed

- **Backend specs: 20/20** catalog-matcher (normalize incl. `~`/`:free`, tier-1 prefix-strip, tier-2
  bare-name ambiguity → NULL, vendor-hint picks, prices ×1e6, free-tier, fetch-failure → NULL
  without throwing). llm-provider module **75/75**. Full backend `npx jest --watchAll=false
  --runInBand` → **595/599**; the 4 failures are the 3 known pre-existing suites
  (terpene/ideas-tasks/telegram-notify), reproduced identically with my changes stashed on `main`.
  `npm run build -w backend` exit 0.
- **Frontend: `npm test -- --watch=false` → 639/639 (60 files), zero unhandled errors**;
  `npm run build` exit 0 (only the pre-existing `strain-hunter.css` budget warning).
- **Live smoke (user-verified):** Auto-Detect returned `131,072` context + `$0.14/$0.28` per 1M in
  ~1s. Route `POST /llm-provider/models/detect-metadata` returns **401 unauthenticated = registered
  and guarded** (not 404). The remaining end-to-end OpenRouter smoke (sync a new model live, custom
  `agnes-*` key → graceful NULL) was **skipped by user decision** — the matcher is covered against
  the real 445-entry payload in the spec.
- `graphify update .` + `architecture-diagram.md` — pending (final session step).

## Backlog (explicitly out of scope)

LiteLLM JSON as second catalog source (Phase 2) · `Total Cost ($)` column in stats · prompt-size-aware Smart Fallback · WebSearch fallback for niche models.