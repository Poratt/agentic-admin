# Static Tool Tier Filtering — keyword domain groups ✅ DONE

**Done:** 2026-09-18 · **Branch:** `feat/static-tool-tier-filtering` · **Commits:** feat + test + docs (this feature, 3 commits)

## Context

The chat agent injected ~75 tools into every LLM call; `HIDDEN_FROM_LLM` trims 6, but everything else arrived
every turn, wasting tokens and letting weak models wander into the wrong tool set. This feature picks a small set
of **domain groups** from the USER prompt via in-process keyword regex; a low-confidence prompt returns the full
75-tool set — capability loss is impossible by construction. Tool-RAG (Phase 2) and benchmark (Phase 3) are out of
scope until this ships and is measured.

## Decisions (user-approved 2026-09-18)

| Topic | Decision |
| --- | --- |
| Where the filter lives | **Separate `ToolTierFilterService`** (testable in isolation), not a parser method |
| `MIN_PROMPT_LENGTH_FOR_HEURISTIC` | **8 chars**; shorter (incl. whitespace-only) → full set |
| Zero groups matched | **Full 75-tool set** (safety net — same array reference) |
| Future tags | **Edit the constants file** (`constants/tool-domain-groups.ts`), redeploy — no DB (YAGNI for 16 tags) |
| MCP tools | **Always-on** — join AFTER the tier filter, never filtered |
| Logging | Tier decision at **debug level every call** (`kept N/M tools (matched: …)`) |

## Findings (Phase 0, the sharp edges)

- **All 81/81 ops** in `swagger-spec.json` carry `@ApiTags`; 16 distinct tags; **`LLM Provider` casing differs** from the kebab-case others and must match verbatim. `app` currently matches no op (forward-looking in ALWAYS).
- **`HIDDEN_FROM_LLM` runs BEFORE the tier filter** (inside `parser.getTools()`), which is safe: the fallback returns exactly that already-hidden set, so the 6 hidden ops can never leak through the filter.
- Prompt is in scope at both call sites (`queryDatabase` / `queryDatabaseStream`) before the loop.
- **⚠️ Hebrew `\b` never matches in JS regex** — `\w` is ASCII-only, so `/\bזן\b/` silently never fired. Hebrew keywords are **bare substrings** (false-positive only keeps MORE tools = the safe direction); Latin keywords keep `\b`. This was caught during implementation and fixed in the shipped data.

## Changes

- `swagger-tools.parser.ts` — `LlmToolSchema.tags?: string[]`; `loadSwaggerAsTools` captures `op.tags ?? []`; the clean-pass spread preserves tags.
- NEW `constants/tool-domain-groups.ts` — `ALWAYS_TAGS`, 7 `DOMAIN_GROUPS`, `MIN_PROMPT_LENGTH_FOR_HEURISTIC = 8`, `MIN_KEYWORD_HITS_TO_TRUST = 1`.
- NEW `services/tool-tier-filter.service.ts` — `filterToolsForPrompt(prompt, allTools)`; untagged tools always kept (cannot be classified → never dropped); debug log in every branch.
- `admin-agent.service.ts` — `getTools(prompt?)`; filter runs on the USER prompt (absent → full set, so `printParsedSwaggerTools` untouched); MCP joins unfiltered after.
- `admin-agent.module.ts` — service registered in providers.
- Specs — parser +4 (tags round-trip, exact `LLM Provider` casing); tier filter +7 (empty / whitespace / unmatched safety-net `toBe` same array; single Hebrew word `ויקיפדיה` → 14/75; cross-domain → 51/75; English currency → 15/75; users → 20/75; always-tags present; unrelated domains excluded); admin-agent.service 4 constructor sites.

## Verification

- Targeted 3 suites **42/42**; full backend `npx jest --watchAll=false --runInBand` → **573 passed / 4 failed = the same 3 pre-existing suites** (terpene, ideas-tasks, telegram-notify) — baseline 562 → +11 new tests, zero new failures. `npm run build -w backend` exit 0.
- **Live smoke test on :3000 (user-confirmed logs):**
  - Startup `--- START SWAGGER-TOOLS-PARSER OUTPUT: LOADED 75 TOOLS ---` (no regression).
  - `תאר לי את הזן Gorilla Glue` → `Tier filter: kept 30/75 tools (matched: strain-hunter, genetics, terpenes)`.
  - `היי` → `Tier filter: kept 75/75 tools (fallback: prompt too short)`.
- `diff --check` clean; no mojibake in new lines; no architecture-diagram change (one more service in the existing AgentCore subgraph).

## Open tails (parked, not blocking)

1. Merge `feat/static-tool-tier-filtering` → `main` (PR / ff).
2. `documents/features/todo/smart-llm-fallback.md` — separate, unrelated plan still in `todo/`.
3. Iterate keyword heuristics from real usage (logs are the observability; the backlog's "domain group auto-suggestion" idea).

## Backlog (explicitly out of scope)

Tool-RAG over `summaryHe` + tags (Phase 2) · 10-prompt benchmark before/after (Phase 3) · per-user tool preferences · tag-aware tool-error messages · domain-group auto-suggestion from unmatched prompts.