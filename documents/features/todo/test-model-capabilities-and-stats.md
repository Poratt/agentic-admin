# Test Model — Capability coverage + statistics parity

## Overview

The "Test" button on every model row in the LLM Providers management page currently
only validates a single thing: **"can this text model answer a one-line prompt?"**
That is useful, but it is a thin signal compared to what each model can actually do,
and it deliberately skips the real-usage statistics so the test results page does
not double-count pings as live traffic.

Two known gaps surfaced during the 2026-09-17 session review (HANDOFF entry on
"Test Model" walkthrough):

1. **Test scope is text-only.** `LlmHealthService.testLlm` rejects any model whose
   `capability !== 'text'` at the gate (line 95). Image / video / embedding /
   audio / function-calling / structured-output capabilities have **no
   connectivity check at all** — the model is just listed in the catalog with a
   "default" state.
2. **Test traffic is invisible to real-usage stats.** The call passes
   `caller: 'health'` which short-circuits `saveCallStat` (line 113 in
   `llm-health.service.ts`). The test-history page and the model statistics tab
   are therefore two disjoint sources of truth for the same event ("a model
   was called and produced N ms latency"), and operators cannot tell whether a
   slow test result was an outlier or part of a real trend.

## Goals

- A single "Test" click on any model validates the **capabilities the model
  declares**, not just text.
- Test results and real-usage statistics share the same data plane, so the
  statistics tab and the test-history page are consistent.
- No regression: existing text-only happy path (success / error / timeout /
  empty response) keeps working and the regression spec added 2026-09-12
  (modelId flow) still passes.

## Out of scope

- Bulk re-test of historical results (separate user request — backlog).
- Re-running tests on a schedule / on provider sync (separate user request —
  backlog).
- Streaming UI during the test call (the test is short enough today; revisit
  if we add image/video waits).

## Architectural landmines (RFC review, 2026-09-18)

Four non-obvious traps surfaced during the architecture review. Each
is a separate spec in Phase 1, and the whole feature is considered
regressed if any of them is dropped:

| # | Landmine | Where it bites | Spec key |
| - | -------- | -------------- | -------- |
| 1 | **Tool-calling false negative** — a plain "Hello" prompt against a `function_calling` model returns a text greeting; the naive test sees `toolCalls.length === 0` and reports the model as broken. | The `function_calling` / `structured_output` branch of `testByCapability`. | L1 |
| 2 | **Video zombie billing** — `POST /v1/video/generations` starts the provider's render + billing on the first 200 OK, regardless of whether we close our socket. | The `video` branch. 3-layer mitigation: cheapest legal job, dry-run flag if supported, immediate `DELETE` on `task_id`. | L2 |
| 3 | **Two-table drift in Statistics tab** — `Ping` and `Real` columns currently read from two different tables and can disagree. | The data plane in Phase 2. Fix: `isTest: boolean` on `LlmCallStatEntity`, one table, two filters. | L3 |
| 4 | **Dirty embedding vectors** — failing providers return `{ data: [] }`, `[null]`, error strings, etc. A naive `vector.length > 0` check passes `[null]`. | The `embedding` branch. Fix: `isValidEmbeddingVector` — strict `Array.isArray` + every element is a finite number. | L4 |

---

## Progress (updated during implementation)

**Phase 0 — DONE (2026-09-18).** Pre-flight findings that diverge from the plan:

- **Capability list is `text | image | video` ONLY.** No `function_calling` / `embedding` / `audio`
  anywhere (types `llm.types.ts` + seed). Landmine 1 & 4 branches would be dead code — per the
  user's decision table and a follow-up approval (2026-09-18), they are NOT implemented; the
  `default` branch (`No test implemented for capability: X`, saved as `error` + HTTP 400) is the
  safety net for any future value.
- **`testAllModels` (health service, synchronous) is NOT a controller route.** The controller
  exposes `testProviderModels` (`POST /llm/providers/:id/test-all`, background) + status GET.
  The sync `testAllModels` is called only by the cron (`llm-tasks.service.ts:24`, every 2h,
  gated by `LLM_HEALTH_CHECK_ENABLED`). No controller/signature regression risk.
- **`caller: 'health'` DID short-circuit recording** — `recordCallStat` had an early return
  (`llm-client.service.ts` old line 238-240). Consequence: `llm_call_stats` holds only real
  traffic today → the new `is_test` column defaults `false` (real) with **zero backfill debt**.
  The `caller <> 'health'` filter in `getModelStats` stays as belt-and-suspenders.
- **Image/video paths (`generateImage`, `createVideoTask`) never recorded any stats** — the new
  image ping mirrors the stat plumbing itself (`recordCallStat`), made public for that purpose.
- Sync models already assigns `capability` per catalog entry; new keys default `text`.

**Phase 1 + 1.5 — DONE (2026-09-18).** 19/19 health specs; full backend 561 passed / 3
pre-existing suites failed (terpene, ideas-tasks, telegram-notify); `nest build` exit 0.
Backend `lint` is broken at the config level (ESLint 9 flat config missing
`@typescript-eslint` plugin) — pre-existing, unrelated.

**Phase 2 — DONE (2026-09-18).** `getModelStats` now reads both Ping and Real from
`llm_call_stats` via `getCallStatAggregates(isTest: boolean)` — `llm_model_test_results` is
no longer a stats source. The `caller <> 'health'` filter was removed; the `HEALTH_CALLER`
const was deleted; the entity's `caller` comment updated to provenance-only. The new L3
regression spec (`reads both halves from llm_call_stats, split solely on is_test`) asserts
`callStatRepo.createQueryBuilder` was called twice and `testResultRepo` was never used.
Swagger summary updated. LLM suite total: 142/142; backend build clean.

**Phase 3 — DONE (2026-09-18).**
- Backend: `LlmModelTestResultEntity` gained a nullable `capability` column; `saveTestResult`
  accepts and persists it; `testLlm` passes `dbModel.capability` through (all 8 assertions in
  `llm-health.service.spec.ts` updated with 5th arg, 41/41 green).
- Frontend management page: row-level Test button icon keyed on `model.capability` (text →
  lightning, image → image, video → play) via new `iconForCapability`; `capabilityLabel` is
  display-safe for null/old rows. Inline test-history table shows `SKIPPED` (with warning
  color) + a neutral capability chip for every result that carries one.
- `testAllModels` guard changed from "active text models" to "active models" (all three
  capabilities are now handled).
- `llm-test-results` chat block: skipped branch (warning icon + "Skipped"), capability chip
  in the card header.
- Specs: 3 new in llm-providers-management (icon mapping, capability-aware testAllModels,
  label null-safety), 1 new in llm-test-results (skipped + capability chip); both target
  files green (94 + 9).
- `ng build` clean (strain-hunter CSS budget warning is pre-existing).

**Phase 4 — pending (documentation + HANDOFF + plan-to-done).**

---

## Phase 0: Research & Preparation (1h)

### Goals

Verify the plan matches the project's actual code paths before touching them.

### Checklist

- [ ] Read `~/.CLAUDE/rules/angular-rules.md`, `~/.CLAUDE/rules/nestjs-rules.md`
- [ ] Read `LlmHealthService.testLlm` end-to-end (lines 81-160 in
      `backend/src/modules/llm/services/llm-health.service.ts`) and trace
      every call out: `providerConfig.getRuntimeSelection`,
      `dbProviderService.findModelById` / `findModelByKey`,
      `client.generateResponse`, `dbProviderService.saveTestResult`
- [ ] Find how `caller: 'health'` is consumed downstream — grep for
      `caller` in `llm-client.service.ts` and `LlmCallStatEntity` to confirm
      the exact branch that skips `saveCallStat`
- [ ] Find all capability values that exist on `LlmModelEntity.capability`
      (today: `text` is enforced; what are the others? check the seed file
      and any migration)
- [ ] Find all callers of `LlmController.testModel` and
      `LlmController.testAllModels` (controller and tests) so the signature
      change does not silently break `Test All`
- [ ] Read the `service-result-container.model.ts` to confirm the return
      shape and the `ServiceResultContainer<T>` helper
- [ ] Read `llm-provider.controller.ts` for the parallel `testAllModels`
      implementation — it iterates models and calls `testLlm` in a loop
      and likely needs the same treatment
- [ ] Read the model statistics controller
      (`LlmProviderController_getStats` or whatever it ended up being
      called) and the `RankingBasis` enum to understand the stats
      contract we must keep consistent
- [ ] Find any frontend `globalFilter` / `searchQuery` regression risk on
      the model row (last cycle: token search refactor)
- [ ] One existing nearby pattern to follow: the
      `2026-09-12 ✅ FIXED: test-now misrouted result + toast direction/design`
      commit is the closest precedent (single-call fix + regression spec
      in the same PR). Use its structure.

### Deliverable

A short pre-flight note covering:

- Exact lines / symbols to change in each of: controller, health service,
  client service, stats query, frontend service, component
- Confirmed list of capability values
- Whether the fix touches `testAllModels` too, and if so, the planned
  change there
- Whether `saveCallStat` needs a new field (`caller` already exists —
  just remove the special-case skip for `'health'`), or whether a
  dedicated `is_test` boolean is cleaner

### Time estimate: 1 hour

---

## Phase 1: Backend — capability-aware testLlm (3h)

### Goals

`testLlm` (and therefore `testModel` and `testAllModels`) dispatches to a
per-capability check function based on `dbModel.capability`. The text
branch is the existing behavior. New branches are added for every
capability the catalog actually uses.

### Architectural landmines the switch MUST respect

These four traps are the reason this phase is not a 30-minute refactor.
Each one was raised during the 2026-09-18 RFC review and changes a
non-obvious line in the new code. **Implement the guards before the
happy path; the spec for each guard is the regression spec for the
whole feature.**

#### Landmine 1 — Tool-calling false negative

A plain "שלום" prompt against a `function_calling` / `structured_output`
model returns a normal text greeting. `response.toolCalls.length`
stays 0. The model is **fine** — the test is wrong.

Mitigation: the `function_calling` / `structured_output` branch must
attach a `tools: [pingTool]` array to the request and force a call via
`tool_choice: { type: 'function', function: { name: 'pingTool' } }`
(or `'required'` if the provider does not accept the explicit form).
Only then is `toolCalls.length > 0` an honest assertion. A model that
still ignores `tool_choice: 'required'` and returns text is genuinely
broken — that is the case the test should catch.

```ts
// sketch — final shape lives in llm-client.service.ts
const pingTool = {
  type: 'function',
  function: {
    name: 'ping',
    description: 'No-op connectivity ping.',
    parameters: { type: 'object', properties: { ok: { type: 'boolean' } } },
  },
};
const req: LlmRequest = {
  prompt: 'ping',
  systemContext: 'You must call the ping tool.',
  tools: [pingTool],
  toolChoice: 'required',           // provider-dependent — see spec
  caller: 'health',
  providerOverride, modelOverride,
};
```

Per-provider override map lives in a constant inside
`llm-client.service.ts` (OpenAI-compatible accepts `'required'`;
Anthropic uses `{ type: 'tool', name: 'ping' }`; some providers
ignore it entirely → document + skip the assertion in that case).

#### Landmine 2 — Video zombie billing

`POST /v1/video/generations` returns 200 + `task_id` **and starts
billing** the provider immediately. Aborting our local fetch after
5 s only closes our socket — the provider keeps rendering and
charges $0.10-0.50 per "Test" click.

Mitigation, layered:
1. **Cheapest possible job** — pass `duration: '1'`, `resolution:
   '480p'`, `frames: 1` (where the provider supports those params).
   Some providers cap at 5 s minimum; document the lowest legal
   value per provider in a constant.
2. **Provider dry-run flag** — if the provider supports
   `validate_only: true` or a dedicated `dryRun` mode, use that
   instead of a real render. Maintain a per-provider flag map.
3. **Immediate cancel on `task_id` receipt** — once the response
   includes a `task_id`, fire-and-forget a
   `DELETE /v1/video/tasks/{task_id}` (best effort, 1 s timeout,
   `void` return — failure to cancel is logged but does not fail
   the test).
4. **Provider allow-list** — only run the video ping against
   providers known to support one of the above three mechanisms.
   For all others, the test records `status: 'skipped'` and
   `errorMessage: 'No safe video ping for provider ${key}'` (see
   Landmine 4 too — a separate `skipped` status is added in
   Phase 1.5 below).

> **Phase 1.5 — `status: 'skipped'` (10 min, may fold into Phase 1):**
> The current `status` enum is `'success' | 'error' | 'timeout'`. A
> skipped test is none of those. Decide: (a) extend the enum with
> `'skipped'`, (b) use `status: 'error'` +
> `errorMessage: 'SKIPPED: ...'`, or (c) add an `isSkipped: boolean`
> column. (a) is cleanest; document the choice in Phase 0.

#### Landmine 3 — Stats data-plane unification (lives in Phase 2)

Adding `isTest: boolean` to `LlmCallStatEntity` means a single
`SELECT … FROM llm_call_stats` can serve both the `Ping` columns
*and* the `Real` columns of the Statistics tab:

- `WHERE is_test = true` → the "Ping" half (success rate, avg latency)
- `WHERE is_test = false` → the "Real" half

Phase 2 closes this loop; Phase 1 must NOT block on it, but the
`saveCallStat` call in each new ping branch must already pass
`isTest: true` (vs the real-usage call sites that pass
`isTest: false`). See Phase 2 for the schema work.

#### Landmine 4 — Embedding response shape is dirty

A failing embedding endpoint can return `{ data: [] }`,
`{ embedding: [null] }`, an error string wrapped in JSON, or a 200
with a string field. A naive `vector.length > 0` check passes
`[null]` and other garbage.

Mitigation: the embedding assertion is **strict** and is the only
assertion that lives inline in `testByCapability` (the others are
delegated to the per-capability ping helper):

```ts
function isValidEmbeddingVector(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}
```

Reject anything else as `status: 'error'`,
`errorMessage: 'Invalid embedding vector: ${typeof v}[${v?.length ?? '?'}]'`.

### Checklist

- [ ] In `llm-health.service.ts`, extract a `testByCapability` switch
      keyed on `dbModel.capability`:
  - `text` — keep the current prompt + assertion
    (response.content or response.toolCalls). **Do NOT** use this
    branch for `function_calling` / `structured_output` (Landmine 1)
  - `function_calling` / `structured_output` — attach the
    `pingTool` and force `tool_choice: 'required'` (or the
    provider-specific override). Assert `response.toolCalls.length
    > 0` AND that the called function name === `'ping'`
  - `image` — send a minimal image-generation call (use the same
    client wrapper as `LlmClientService.generateImage`); assert
    non-empty image URL / base64
  - `video` — start a `createVideoTask` ping with the cheapest
    legal job (Landmine 2). On `task_id` receipt, fire-and-forget
    a `DELETE` against the provider's cancel endpoint. Use a 5 s
    ceiling on the whole flow
  - `embedding` — send a 1-token string; assert with
    `isValidEmbeddingVector` (Landmine 4)
  - `audio` — covered if and only if the catalog has an `audio`
    capability; otherwise record `status: 'skipped'` (Phase 1.5
    decision)
- [ ] If a capability is not in the switch, the test result must
      record `status: 'error'`, `errorMessage: 'No test implemented
    for capability: ${capability}'` and the controller returns
      `400 BadRequestException`
- [ ] Phase 1.5: extend the `status` enum to include `'skipped'`
      (Landmine 2 final paragraph) — co-ship with Phase 1
- [ ] Every ping branch in the new switch passes `isTest: true` to
      `saveCallStat` (Landmine 3 — Phase 2 depends on this being
      correct on day one)
- [ ] `LlmClientService` gains 3 thin ping helpers
      (`pingFunctionCall`, `pingImage`, `pingVideo`,
      `pingEmbedding`) so `LlmHealthService` does not have to
      import provider-specific code
- [ ] `LlmController.testModel` — no signature change; the controller
      still forwards `modelId` to `testLlm`. Add a swagger
      `summaryHe` update to mention the per-capability behavior
- [ ] `LlmProviderController.testAllModels` — confirm the loop passes
      `modelId` through to `testLlm` (already does, per the 2026-09-12
      fix). The per-capability switch fires for each model
      automatically
- [ ] Per-provider constants in `llm-client.service.ts`:
      - `VIDEO_PING_PARAMS: Record<providerKey, { duration,
        resolution, frames, validateOnly? }>`
      - `VIDEO_CANCEL_ENDPOINT: Record<providerKey, (taskId) =>
        string>` (returns `null` if the provider has no cancel)
      - `FUNCTION_CALL_TOOL_CHOICE: Record<providerKey, unknown>`
        (per-provider `tool_choice` shape)
- [ ] Save the test result exactly as today
      (`dbProviderService.saveTestResult`) — no entity change in
      Phase 1 (the `capability` column addition is Phase 3)
- [ ] Specs (one regression spec per landmine):
  - [ ] **L1:** `function_calling` model returns text-only on a
        plain prompt → pingTool + `tool_choice: 'required'`
        forces a tool call → test passes (regression for
        Landmine 1)
  - [ ] **L2:** `video` ping issues the `DELETE` on `task_id`
        receipt (mocked `fetch`) and records the cancel attempt
        (regression for Landmine 2)
  - [ ] **L3:** every new ping branch writes a `saveCallStat`
        row with `isTest: true` (regression for Landmine 3)
  - [ ] **L4:** embedding assertion rejects `[null]`, `[]`,
        `['1', '2']`, and an error string (regression for
        Landmine 4)
  - [ ] One happy-path + one capability-rejection spec per
        supported capability

### Files

- `backend/src/modules/llm/services/llm-health.service.ts` (refactor)
- `backend/src/modules/llm/services/llm-client.service.ts` (add
  ping helpers + per-provider constants)
- `backend/src/modules/llm/llm.controller.ts` (swagger text only)
- `backend/src/modules/llm/services/llm-health.service.spec.ts`
  (new or extended)
- `backend/src/modules/llm-provider/entities/llm-model-test-results.entity.ts`
  (Phase 1.5: `status` enum gains `'skipped'`)

### Time estimate: 3 hours (+10 min for Phase 1.5 if the enum
extension is folded in, +1h if it is a standalone migration)

---

## Phase 2: Backend — unify test traffic with real-usage statistics (2h)

### Goals

Test pings show up in the model statistics tab and in the test history
at the same time, with the same latency and status. No double counting,
no divergence.

### Data-plane unification (Landmine 3, RFC review 2026-09-18)

The Statistics tab today runs **two disjoint queries** to build the
`Ping` columns and the `Real` columns — `Ping` from
`llm_model_test_results`, `Real` from `llm_call_stats`. The two
tables can drift on the same call (one inserts, the other fails),
and the join logic lives in JS, not SQL.

This phase unifies them on a single `llm_call_stats` table by adding
an `isTest: boolean` column:

- `SELECT … WHERE is_test = true` → drives the **Ping** half of the
  Statistics tab
- `SELECT … WHERE is_test = false` → drives the **Real** half

That is one source of truth, one index on `(modelId, isTest, createdAt)`,
and zero risk of `Ping.success` disagreeing with `Real.success`
because of an unrelated insert failure.

Phase 1 already writes `isTest: true` on every new ping branch (the
L3 regression spec proves it). Phase 2 makes the consumer side read
that flag.

### Checklist

- [ ] Wire format — DECIDED 2026-09-17 + REINFORCED 2026-09-18:
      **Option A.** Add an `isTest: boolean` column to
      `LlmCallStatEntity` (migration needed). Remove the
      `caller: 'health'` special case from `LlmClientService`. The
      statistics query (`rankingBasis`, fastest / mostStable) gets a
      new filter `WHERE is_test = 0` to keep "real usage" clean.
      (Option B rejected: it duplicates the "what does a success look
      like" logic in two places.)
- [ ] Migration: `ALTER TABLE llm_call_stats ADD COLUMN is_test
      BOOLEAN NOT NULL DEFAULT FALSE` (existing rows are real
      usage; backfill is safe). New index
      `idx_call_stats_model_test_time (modelId, isTest, createdAt)`
- [ ] Update `LlmCallStatEntity` (`@Column({ name: 'is_test',
      default: false }) isTest!: boolean`) and update every
      `saveCallStat` call site to pass `isTest: false` (real
      usage) or `isTest: true` (test ping — set by Phase 1's
      new ping branches)
- [ ] Update the statistics query in
      `llm-provider.service.ts`:
  - The `Real` half (fastest, mostStable, rankingBasis) keeps the
    existing behavior — implicit `WHERE is_test = false`
  - The `Ping` half (currently a join with `llm_model_test_results`)
    becomes `SELECT … FROM llm_call_stats WHERE is_test = true`
    grouped by model, with the same success-rate and avg-latency
    projections
  - **Single source of truth:** `llm_model_test_results` becomes a
    per-row audit log only (used by the test-history page), and
    `llm_call_stats` becomes the only table the Statistics tab reads
- [ ] Update the Statistics tab swagger description so the user
      understands what "Real" means now (real user / agent traffic,
      never a connectivity ping)
- [ ] Remove the `caller: 'health'` argument from the `testLlm` →
      `generateResponse` call path; `isTest: true` is the new
      signal
- [ ] Verify the `Test All` (background) flow does not pollute the
      ranking — every model in the test sequence writes
      `isTest = true`, the `isTest = false` filter on
      rankingBasis keeps "real usage" clean
- [ ] Re-verify the 2026-09-12 regression spec still passes (the
      `modelId` flow into `saveTestResult` is independent of the
      statistics change)
- [ ] Specs:
  - [ ] Single test call produces BOTH a row in
        `llm_model_test_results` AND a row in `llm_call_stats` with
        `isTest: true`
  - [ ] Statistics query for `Real` excludes `isTest = true` rows
        (regression for the ranking-pollution risk)
  - [ ] Statistics query for `Ping` reads from `llm_call_stats`,
        not `llm_model_test_results` (the old code path)

### Files

- `backend/src/modules/llm-provider/entities/llm-call-stats.entity.ts`
  (new column)
- A new migration file in
  `backend/src/modules/llm-provider/migrations/` (TypeORM)
- `backend/src/modules/llm/services/llm-client.service.ts`
  (remove special case)
- `backend/src/modules/llm-provider/llm-provider.service.ts`
  (stats query update)
- `backend/src/modules/llm-provider/llm-provider.controller.ts`
  (text + rankingBasis text)
- New or extended spec

### Time estimate: 2 hours

---

## Phase 3: Frontend — surface the new results (1.5h)

### Goals

The user can see which capability was tested, and (if Option A) the
test entry shows up consistently in the model statistics tab.

### Checklist

- [ ] `LlmModelTestResultEntity` — DECIDED 2026-09-17: extend the entity
      with a server-side `capability: string` column + migration
      (honest history even if the model row changes later).
- [ ] In `llm-providers-management.ts`, the row-level test button
      label / icon must reflect the model capability (text, image,
      video, embedding). Use the existing `ph-*` icon set
      (`ph-lightning` for text, `ph-image` for image,
      `ph-play` for video, `ph-graph` for embedding, etc.)
- [ ] In `llm-test-results.component.ts` (or whatever the test
      history component is called — verify before editing), add a
      small capability badge next to each result row. If the badge
      component is local, keep it local; do not promote to global
      just for this
- [ ] If Option A (statistics parity): the model statistics tab
      already pulls from `llm_call_stats` — confirm the new
      `is_test` filter is reflected in the swagger summary so the
      user knows what "real usage" means
- [ ] Add 1 component spec proving the button label / icon changes
      when `model.capability` changes

### Files

- `frontend/src/app/features/llm-providers-management/llm-providers-management.ts`
- `frontend/src/app/features/llm-providers-management/llm-providers-management.html`
- `frontend/src/app/features/llm-providers-management/llm-providers-management.spec.ts`
- `frontend/src/app/features/llm-test-results/llm-test-results.ts` (or
  equivalent — verify path first)
- Possibly
  `backend/src/modules/llm-provider/entities/llm-model-test-results.entity.ts`
  if we add the capability column server-side

### Time estimate: 1.5 hours

---

## Phase 4: Documentation (0.5h)

### Checklist

- [ ] `documents/HANDOFF.md` — new "✅ DONE" entry: list of new
      capabilities tested, where the migration lives, what the
      statistics tab now means
- [ ] `documents/STATUS.md` — top entry for this session
- [ ] `documents/LOG.md` — record the Option A vs Option B decision
      (with the reason)
- [ ] `documents/architecture-diagram.md` — no change expected
      (this is a behavior change inside an existing endpoint, not
      a new module or a new external integration)
- [ ] Move this file from `features/todo/` to `features/done/`
- [ ] `README.md` of the project (if it documents model testing) —
      update the "Test" button description

### Time estimate: 30 minutes

---

## Total Time Summary

| Phase     | Description                             | Time   |
| --------- | --------------------------------------- | ------ |
| 0         | Research & Preparation                  | 1h     |
| 1         | Backend — capability-aware testLlm      | 3h     |
| 1.5       | `status: 'skipped'` enum extension      | 10m    |
| 2         | Backend — unify test traffic with stats | 2h     |
| 3         | Frontend — surface the new results      | 1.5h   |
| 4         | Documentation                           | 0.5h   |
| **Total** |                                         | **8h 10m** |

---

## Open Decisions (before starting Phase 1)

**DECIDED 2026-09-17 by user:**

| Question                                                        | Decision                                                               | Note                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Entity: add `capability` to test result**                     | ✅ Server-side column                                                  | Honest history even if the model row changes later; costs one migration |
| **Stats parity mechanism**                                      | ✅ New `is_test` column on `LlmCallStatEntity` + filter on stats query | Single data plane; ranking stays clean                                  |
| **Test All stats behavior**                                     | ✅ Filtered out of "real usage" ranking                                | Tests are not real usage                                                |
| **Video test timeout**                                          | ✅ 5 s ceiling, abort on first "task created" signal                   | Connectivity check; never hangs the UI                                  |
| **Capabilities the switch must cover**                          | ✅ Whatever the catalog actually has today + 1 slot for future `audio` | Soft-typed; does not break on new capabilities                          |
| **Do we also gate the "Test All" button on capability support** | ✅ Hide the button if the model has no supported capability            | Cleaner UI; no dead button                                              |

| Question                                                        | Option A                                                            | Option B                                                                            | Note                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Entity: add `capability` to test result**                     | Yes, server-side column                                             | No, derive client-side from `model.capability`                                      | A is more honest; B is zero-migration                                       |
| **Stats parity mechanism**                                      | New `is_test` column on `LlmCallStatEntity` + filter on stats query | Drop `saveCallStat` from test path; let the stats tab join `llm_model_test_results` | A keeps the schema simple; B duplicates the "success looks like X" logic    |
| **Test All stats behavior**                                     | Filtered out of "real usage" ranking                                | Shown alongside real usage                                                          | A is what users expect from a "test" button                                 |
| **Video test timeout**                                          | 5 s ceiling, abort on first "task created" signal                   | 30 s ceiling, wait for completion                                                   | A is honest about "connectivity check"; B is more accurate but hangs the UI |
| **Capabilities the switch must cover**                          | Whatever the catalog actually has today + 1 slot for future `audio` | Lock to a hard-coded list                                                           | Soft-typed is safer; hard-coded is auditable                                |
| **Do we also gate the "Test All" button on capability support** | Hide the button if the model has no supported capability            | Always show; record `error: 'No test implemented'`                                  | UX choice — flag for user                                                   |

---

## Success Criteria

1. `npm run test -w backend` — passes with new specs
2. `npm run build -w backend` — exit 0
3. `npx ng test --watch=false` (from `frontend/`) — passes
4. `npx ng build` (from `frontend/`) — exit 0
5. Empirically: open the LLM Providers page, click Test on (a) a text
   model, (b) an image model, (c) a video model — all three return a
   status within ~10 s, and the test history page shows three rows
   with the right capability badge each
6. Empirically: open the model statistics tab — the same three test
   calls are visible there too (Option A) OR explicitly absent with a
   "tests are tracked separately" tooltip (Option B). The behavior
   matches the documentation in `HANDOFF.md`
7. `git diff --check` clean, no mojibake
8. `graphify update .` run after the change
9. No architecture-diagram change (this is behavior inside an existing
   module, not a new module boundary)
10. The 2026-09-12 `modelId` regression spec still passes unchanged

---

## Backlog (not in scope here)

- Daily background re-test of every active model
- Bulk re-test of historical failures
- Streaming UI during long-running video tests
- Per-provider override of test prompt (some providers behave
  differently on trivial prompts)
- Auto-archive test results older than N days (entity already has
  `deleteOldTestResults` — wire it to a cron)
