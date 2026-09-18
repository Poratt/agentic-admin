# Test Model — Capability coverage + statistics parity ✅ DONE

**Done:** 2026-09-18 · **Branch:** `feat/test-model-capabilities-and-stats` (pushed, tracking origin) · **Commits:** `741d55f` (chore: jest workers), `c44f737` (feat), `919cea4` (docs)

## Context

Two gaps from the 2026-09-17 review: the "Test" button was text-only (`testLlm` rejected
`capability !== 'text'`), and test traffic was invisible to real-usage stats (`caller:
'health'` short-circuited `saveCallStat` — test history and the Statistics tab were two
disjoint sources of truth).

## Decisions (user-approved 2026-09-17 / 18)

| Topic | Decision |
| --- | --- |
| Capability set | **`text \| image \| video` only** — `function_calling`/`embedding`/`audio` are dead code, NOT implemented; `default` branch is the safety net |
| Video test | **`skipped` (Protected Mode)** — no provider call; records `'No safe video ping for provider'`; returns `success:true, available:false`. Rationale: providers bill on first 200 OK; no safe dry-run/cancel verified. *(2026-09-18: model is currently FREE — enable-via-per-model-flag considered, user decided keep as-is)* |
| Default branch | persist an `'error'` row, then `400 BadRequestException('No test implemented for capability: X')` |
| Stats parity (Option A) | `is_test` boolean on `LlmCallStatEntity`; Stats tab reads **both** halves from `llm_call_stats`; `llm_model_test_results` = audit log only |
| `capability` on test result | server-side nullable column (honest history) |
| Test All | `testAllModels` guard = **all** active models (not text-only); still filtered out of real-usage ranking |

Sanity finding: `recordCallStat` short-circuited `caller === 'health'` → `llm_call_stats` held
only real traffic → `is_test DEFAULT FALSE` = **zero backfill debt**.

## Changes

**Backend**
- `llm.types.ts` — `LlmRequest.isTest?`; `caller` becomes provenance-only.
- `llm-call-stat.entity.ts` — `is_test` bool (default false); `caller` comment updated.
- `llm-model-test-results.entity.ts` — status enum + `'skipped'`; nullable `capability` column.
- `llm-health.service.ts` — `testByCapability` switch (`testTextModel`/`testImageModel`/video→skipped/default→400); `testProviderModels` not text-only; image ping writes stats via public `recordCallStat(..., isTest: true)`.
- `llm-client.service.ts` — `recordCallStat` public with `isTest`; health early-return removed; 3 thin ping helpers.
- `llm-provider.service.ts` — `saveCallStat` accepts `isTest`, `saveTestResult` accepts `capability`; `getModelStats` via `getCallStatAggregates(isTest)` (both halves from `llm_call_stats`); `HEALTH_CALLER` deleted.
- Swagger text updated (stats endpoint + model-test endpoint).

**Frontend**
- `llm-providers-management.ts` — `iconForCapability` (text=lightning/image=image/video=play), null-safe `capabilityLabel`; `testAllModels` counts all active models.
- `llm-providers-management.html|css` — Test button icon/tooltip per capability; inline history shows `SKIPPED` (warning) + capability chip.
- `llm-test-results` chat block — skipped branch (warning icon + "Skipped") + capability chip in card header; `RenderData` gains `capability?`.

## Verification

- Backend full suite (commit gate): **562 passed / 3 pre-existing suites failed** (terpene, ideas-tasks, telegram-notify) — no new failures.
- Frontend targeted: management **94/94**, llm-test-results **9/9**; `nest build` + `ng build` exit 0.
- **Live smoke test (user):** Agnes Image 2.0/2.1 Flash → SUCCESS (10.8s/11.3s, log `OK`); Agnes Video V2.0 → SKIPPED `No safe video ping for provider`.
- `graphify update .` (5157 nodes / 8586 edges / 351 communities); no mojibake; no architecture-diagram change (columns on existing entities + aggregate refactor inside an existing endpoint).

## Open tails (parked, not blocking)

1. Merge `feat/test-model-capabilities-and-stats` → `main` (PR). *Only remaining step.*
2. `@swc/jest` swap to cut ts-jest RAM/time (user suggestion; optional).
3. Video ping enablement via per-model flag IF a provider is free/verifiable (user: keep Protected Mode for now).
4. Backend `lint` broken at config level (ESLint 9 missing `@typescript-eslint` plugin) — pre-existing.

## Backlog (out of scope, untouched)

Daily re-test cron · bulk re-test of failures · streaming UI for long video tests · per-provider test-prompt override · auto-archive `llm_model_test_results` (`deleteOldTestResults` → cron).