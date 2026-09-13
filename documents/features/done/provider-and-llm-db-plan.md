# Provider And LLM DB Plan

## Goal

Move LLM provider and model management from static constants and environment-only configuration into the database, and expose an Angular settings UI for admins to manage providers and models.

The longer-term purpose is scheduled LLM evaluation: run cron/manual tests, store historical results, and rank models by availability, latency, speed, and quality.

The chat UI must continue to work through the existing model selection flow:

- `GET /llm/model-options`
- `GET /llm/status`
- per-request `provider` and `model` overrides in chat requests

## Current State

- Backend LLM runtime configuration is mostly environment-driven through `LlmProviderConfigService`.
- Static cloud model options come from `backend/src/modules/llm/constants/llm-model-catalog.constant.ts`.
- Ollama models are discovered dynamically through the local Ollama `/api/tags` endpoint.
- Existing health checks are request-time checks only; test results are not persisted and cannot currently be used for model ranking.
- Angular chat consumes `frontend/src/app/core/services/llm.service.ts`.
- `frontend/src/app/features/settings/` currently exists but is incomplete and should be treated as a rough placeholder, not as the final implementation pattern.

## Target Data Model

### LlmProvider Entity

Table: `llm_providers`

Fields:

- `id: number`
- `key: string`
  - Examples: `openrouter`, `nvidia`, `ollama`
  - Stable technical id used by backend request routing.
- `label: string`
  - Human-facing provider label.
- `baseUrl: string`
- `apiKeyEncrypted: string | null`
  - Never return this value to the frontend.
  - For Ollama this can stay null or a non-secret internal value.
- `defaultModelId: number | null`
  - Relation to `LlmModel`.
- `active: boolean`
  - Whether this provider can be selected and used.
- `createdAt: Date`
- `updatedAt: Date`

Constraints:

- Unique `key`.
- `baseUrl` required.
- `label` required.

### LlmModel Entity

Table: `llm_models`

Fields:

- `id: number`
- `providerId: number`
- `name: string`
  - Exact provider model id sent to the LLM API.
  - Examples: `google/gemma-4-31b-it:free`, `notron 3 Super 120b A12B(NVIDIA)`.
- `label: string`
  - Human-facing label shown in Angular selectors.
- `active: boolean`
- `supportsStreaming: boolean`
- `supportsTools: boolean`
- `contextWindow: number | null`
- `sortOrder: number`
- `runtimeDiscovered: boolean`
  - True for records discovered from a runtime source such as Ollama.
  - False for admin-managed cloud models.
- `lastSeenAt: Date | null`
  - Used for runtime-discovered models that may disappear from the local Ollama app.
- `createdAt: Date`
- `updatedAt: Date`

Constraints:

- Unique pair: `providerId + name`.
- `name` required.
- `label` required.

### LlmModelTestRun Entity

Table: `llm_model_test_runs`

Stores each manual or scheduled model evaluation run.

Fields:

- `id: number`
- `startedAt: Date`
- `finishedAt: Date | null`
- `trigger: 'manual' | 'cron'`
- `status: 'running' | 'completed' | 'failed'`
- `totalModels: number`
- `testedModels: number`
- `failedModels: number`
- `createdAt: Date`
- `updatedAt: Date`

### LlmModelTestResult Entity

Table: `llm_model_test_results`

Stores per-model metrics for one evaluation run.

Fields:

- `id: number`
- `runId: number`
- `providerId: number`
- `modelId: number | null`
- `providerKey: string`
  - Denormalized snapshot for stable historical reporting.
- `modelName: string`
  - Denormalized snapshot for stable historical reporting.
- `modelLabel: string`
  - Denormalized snapshot for stable historical reporting.
- `available: boolean`
- `success: boolean`
- `errorMessage: string | null`
- `latencyMs: number | null`
- `timeToFirstTokenMs: number | null`
- `tokensPerSecond: number | null`
- `inputTokens: number | null`
- `outputTokens: number | null`
- `qualityScore: number | null`
- `qualityReason: string | null`
- `testedAt: Date`

Indexes:

- `providerKey + modelName + testedAt`
- `runId`
- `modelId`

## Ollama Model Strategy

Ollama models are runtime state of the machine, not a stable cloud catalog. They can change outside this app through `ollama pull`, `ollama rm`, app shutdown, or server replacement.

Decision:

- Cloud provider models are DB-managed.
- Ollama provider configuration is DB-managed.
- Ollama installed models are discovered dynamically from the Ollama app.
- DB may store Ollama metadata and test history keyed by provider + model name, but DB is not the source of truth for whether an Ollama model is currently installed.
- Ollama models that exist in DB metadata but are not currently installed should be marked `missing` in admin UI and excluded from chat model options by default.

## Cron Test Cadence

Default cadence:

- Run scheduled model tests every 6 hours.
- Allow manual test runs from the Settings UI at any time.
- Keep one global cron job initially; add per-provider cadence only if paid provider cost or rate limits require it.

Runtime limits:

- Limit concurrency to avoid saturating local Ollama or paid APIs.
- Use per-model timeout so one stuck model does not block the entire run.
- Persist failed results instead of dropping them.
- Store enough data for ranking, but do not store full prompt/response text unless explicitly needed later.

Future cadence options:

- Local Ollama: every 3-6 hours is acceptable.
- Paid cloud providers: every 6-12 hours by default.
- Manual tests should always be available for immediate validation after adding a provider/model.

## API Contract

All management endpoints require JWT and admin authorization.

Keep existing read endpoints compatible:

- `GET /llm/providers`
- `GET /llm/model-options`
- `GET /llm/status`
- `GET /llm/llm-test`
- `GET /llm/test-all`

Add management endpoints:

### Providers

- `GET /llm/admin/providers`
  - Returns providers with safe metadata only.
  - Includes `hasApiKey: boolean`, not the actual key.

- `POST /llm/admin/providers`
  - Creates a provider.
  - Body: `key`, `label`, `baseUrl`, optional `apiKey`, optional `active`.

- `PATCH /llm/admin/providers/:id`
  - Updates provider metadata.
  - Empty or omitted `apiKey` means keep existing key.
  - Explicit key replacement should overwrite the stored encrypted key.

- `DELETE /llm/admin/providers/:id`
  - Prefer soft disable first: set `active = false`.
  - Hard delete only if no models/history dependencies make that risky.

### Models

- `GET /llm/admin/providers/:providerId/models`
  - Returns models for one provider.

- `POST /llm/admin/providers/:providerId/models`
  - Creates a model under a provider.
  - Body: `name`, `label`, optional capability fields.

- `PATCH /llm/admin/models/:id`
  - Updates model metadata and active state.

- `DELETE /llm/admin/models/:id`
  - Prefer soft disable first: set `active = false`.

- `PATCH /llm/admin/providers/:providerId/default-model/:modelId`
  - Sets provider default model.
  - Validate model belongs to provider.

### Test Runs And Rankings

- `POST /llm/admin/test-runs`
  - Starts a manual test run across active configured models.
  - Optional filters: provider id/key, model ids/names, test profile.

- `GET /llm/admin/test-runs`
  - Returns recent test runs.

- `GET /llm/admin/test-runs/:id/results`
  - Returns per-model results for one run.

- `GET /llm/admin/model-rankings`
  - Returns current ranked models based on recent test results.

- `GET /llm/admin/models/:id/test-history`
  - Returns historical metrics for one managed DB model.

- `GET /llm/admin/runtime-models/ollama`
  - Returns currently installed Ollama models merged with DB metadata and latest scores.

## DTO Rules

Provider response DTO must include:

- `id`
- `key`
- `label`
- `baseUrl`
- `active`
- `hasApiKey`
- `defaultModelId`
- `defaultModelName`
- `modelsCount`

Provider response DTO must not include:

- `apiKey`
- `apiKeyEncrypted`
- secret headers

Model response DTO must include:

- `id`
- `providerId`
- `name`
- `label`
- `active`
- `supportsStreaming`
- `supportsTools`
- `contextWindow`
- `sortOrder`
- `runtimeDiscovered`
- `installed`
- `missing`
- `lastSeenAt`

Model test result DTO must include:

- `id`
- `runId`
- `providerKey`
- `modelName`
- `modelLabel`
- `available`
- `success`
- `errorMessage`
- `latencyMs`
- `timeToFirstTokenMs`
- `tokensPerSecond`
- `qualityScore`
- `qualityReason`
- `testedAt`

Model ranking DTO must include:

- `providerKey`
- `modelName`
- `modelLabel`
- `available`
- `overallScore`
- `availabilityScore`
- `latencyScore`
- `speedScore`
- `qualityScore`
- `sampleSize`
- `lastTestedAt`

Existing chat model options response should remain grouped:

```ts
{
  label: 'openrouter',
  items: [
    {
      id: '1',
      provider: 'openrouter',
      value: 'google/gemma-4-31b-it:free',
      label: 'Google GEMMA 4 31b IT'
    }
  ]
}
```

## Backend Implementation Phases

### Phase 1 - Entities And Module Wiring

Files likely touched:

- `backend/src/modules/llm/entities/llm-provider.entity.ts`
- `backend/src/modules/llm/entities/llm-model.entity.ts`
- `backend/src/modules/llm/llm.module.ts`

Tasks:

- Add TypeORM entities.
- Register entities with `TypeOrmModule.forFeature(...)`.
- Keep `autoLoadEntities` compatibility.

Verification:

- `npm.cmd run build` from `backend/`.

### Phase 2 - Repository Service

Files likely touched:

- `backend/src/modules/llm/services/llm-provider-registry.service.ts`
- `backend/src/modules/llm/services/llm-provider-config.service.ts`
- `backend/src/modules/llm/services/llm-model-catalog.service.ts`

Tasks:

- Add DB-backed registry service for provider/model CRUD and safe read DTO mapping.
- Refactor `LlmProviderConfigService` to resolve provider configs from DB first.
- Preserve env fallback for first boot or missing DB records.
- Refactor `LlmModelCatalogService.getModelOptions()` to use active DB models.
- Keep Ollama dynamic model discovery as a special case, either merged with DB models or exposed as discovered-only options.

Important decision:

- DB is the source of truth for cloud providers and manually added models.
- Env remains a bootstrap/fallback mechanism, not the admin-managed source of truth.

Verification:

- Existing `GET /llm/model-options` still returns the same shape used by Angular chat.
- `npm.cmd run build` from `backend/`.

### Phase 3 - Admin Controller Endpoints

Files likely touched:

- `backend/src/modules/llm/llm.controller.ts`
- new DTO files under `backend/src/modules/llm/dto/`
- `backend/swagger-spec.json`

Tasks:

- Add admin CRUD endpoints.
- Add Swagger docs.
- Add `JwtAuthGuard` and `AdminGuard`.
- Validate all input through DTOs.
- Never return API keys.

Verification:

- `npm.cmd run build` from `backend/`.
- Swagger spec generation/update if controller contract changes are reflected manually in this project.

### Phase 4 - Seed / Bootstrap Defaults

Files likely touched:

- `backend/src/modules/llm/services/llm-provider-seed.service.ts` or similar.
- `backend/src/modules/llm/llm.module.ts`.

Tasks:

- On startup, seed missing providers from existing env values:
  - OpenRouter
  - NVIDIA
  - Ollama
- Seed static models from `LLM_STATIC_MODEL_GROUPS` once, if not present.
- Avoid overwriting admin edits on every boot.

Verification:

- Empty DB gets initial providers/models.
- Existing DB keeps admin changes.
- `npm.cmd run build` from `backend/`.

### Phase 5 - LLM Health Integration

Files likely touched:

- `backend/src/modules/llm/services/llm-health.service.ts`
- `backend/src/modules/llm/services/llm-client.service.ts`

Tasks:

- `testAllModels()` should use active DB models.
- `testLlm(provider, model, ...)` should validate provider/model against DB unless using a discovered Ollama model.
- `LlmClientService` should create provider-specific clients from DB config.

Verification:

- Existing LLM test endpoints compile and keep response shape.
- Runtime manual check with one configured provider.

### Phase 6 - Scheduled Test Runs And Ranking

Files likely touched:

- `backend/src/modules/llm/services/llm-model-test-runner.service.ts`
- `backend/src/modules/llm/services/llm-model-ranking.service.ts`
- `backend/src/modules/llm/entities/llm-model-test-run.entity.ts`
- `backend/src/modules/llm/entities/llm-model-test-result.entity.ts`

Tasks:

- Add manual test-run service that tests active DB-managed cloud models and currently installed Ollama models.
- Persist one `LlmModelTestRun` per run.
- Persist one `LlmModelTestResult` per tested model.
- Measure at minimum:
  - availability
  - success/failure
  - error message
  - latency
  - token/output estimate when available
  - quality score placeholder
- Add ranking calculation from recent results.
- Add cron execution every 6 hours after manual test runs are stable.
- Keep timeout and concurrency limits.

Verification:

- Manual test run creates a run row and result rows.
- Failed model calls are persisted as failed results.
- Ranking endpoint returns deterministic sorted results.
- `npm.cmd run build` from `backend/`.

## Frontend Implementation Phases

### Phase 7 - Angular Service Contract

Files likely touched:

- `frontend/src/app/core/services/llm.service.ts`
- new frontend interfaces if needed under `frontend/src/app/core/models/`

Tasks:

- Keep existing `getModelOptions()` and `getStatus()`.
- Add admin methods:
  - `getAdminProviders()`
  - `createProvider(...)`
  - `updateProvider(...)`
  - `disableProvider(...)`
  - `getProviderModels(providerId)`
  - `createModel(providerId, ...)`
  - `updateModel(modelId, ...)`
  - `disableModel(modelId)`
  - `setDefaultModel(providerId, modelId)`
  - `startModelTestRun(...)`
  - `getModelTestRuns()`
  - `getModelTestRunResults(runId)`
  - `getModelRankings()`

Verification:

- `npx ng build` from `frontend/`.

### Phase 8 - Settings Page State

Files likely touched:

- `frontend/src/app/features/settings/settings.ts`
- `frontend/src/app/features/settings/settings.html`
- optional `frontend/src/app/features/settings/settings.css` only if global styles are insufficient.

Tasks:

- Turn Settings into a real async page.
- Use `PageStates`.
- Expose `readonly PageStates = PageStates`.
- Add `pageState = computed<PageStates>(...)`.
- Template must use `@switch (pageState())`.
- Load providers from admin API.
- Show empty state only when no providers exist.

Verification:

- `npx ng build` from `frontend/`.

### Phase 9 - Settings UI

UI requirements:

- Page title: settings.
- Main section: LLM providers.
- Provider list:
  - provider label/key
  - base URL
  - active/inactive
  - has API key indicator
  - default model
  - model count
- Provider actions:
  - add provider
  - edit provider
  - disable provider
  - set default model
- Provider form:
  - provider key
  - label
  - base URL
  - write-only API key field
  - active toggle
  - save/cancel actions
- Model list per provider:
  - model label
  - model name
  - active/inactive
  - streaming/tools capability badges
  - latest score
  - latest latency
  - latest availability
  - installed/missing indicator for Ollama
  - edit/disable actions
- Model form:
  - provider selector or fixed provider context
  - model name
  - label
  - active toggle
  - supports streaming toggle
  - supports tools toggle
  - context window number input
  - sort order number input
  - save/cancel actions
- Test results table:
  - provider
  - model
  - availability
  - latency
  - tokens/sec
  - quality score
  - overall score
  - tested at
  - error message when failed
- Test actions:
  - start manual all-model test
  - start provider-only test
  - view latest run
  - view run history
- Forms:
  - use project form controls and global button styles.
  - avoid unnecessary component-specific CSS.

UX rules:

- Never display stored API keys.
- API key field should be write-only.
- On edit, show placeholder like `Configured` when key exists.
- Keep technical values such as provider key, model name, URLs, and API keys left-to-right with `dir="ltr"` where shown.

Verification:

- `npx ng build` from `frontend/`.
- Manual browser check of `/settings`.

## Security Notes

- Do not return secrets to the frontend.
- Do not log API keys.
- Consider encryption for `apiKeyEncrypted`.
- If encryption is not implemented in the first pass, name the risk clearly and keep the field hidden from DTOs.
- Only admins can manage providers and models.
- Regular authenticated users can still read safe model options for chat selection if that is already allowed by the current flow.

## Migration / Compatibility Strategy

1. Add DB entities and seed from current static/env config.
2. Keep current public LLM endpoints response-compatible.
3. Switch model option reads to DB.
4. Add manual test-run persistence and ranking endpoints.
5. Add Angular admin UI for providers, models, rankings, and test results.
6. Add cron after manual test runs are stable.
7. Once stable, decide whether `LLM_STATIC_MODEL_GROUPS` remains as seed data only or is deleted.

## Testing Checklist

Backend:

- `npm.cmd run build`
- Existing provider status endpoint still compiles and returns safe DTO shape.
- Existing model options endpoint still groups models by provider.
- Admin CRUD rejects non-admin users.
- API key is never returned in responses.
- Default model must belong to the selected provider.
- Manual test run persists one run and per-model result rows.
- Ranking endpoint sorts by deterministic score.
- Missing Ollama models do not appear in chat model options unless explicitly allowed.

Frontend:

- `npx ng build`
- `/settings` loading/error/empty/ready states render correctly.
- Add/edit provider updates list without page reload.
- Add/edit model updates provider model list.
- Chat model selector still receives model options in the previous shape.
- Settings shows provider forms, model forms, rankings, and latest test results.

Manual:

- Configure OpenRouter provider and model.
- Set it as default.
- Send one chat request with that model.
- Run single model test.
- Run manual all-model test and confirm stored results appear in Settings.
- Disable model and confirm it disappears from chat selector.

## Open Decisions

- Should provider deletion be hard delete or soft disable only?
- Should API keys be encrypted at rest in the first implementation phase? - MANDATORY!!!
- Should Ollama metadata rows be created automatically for every discovered model, or only after the admin edits/marks a model?
- Should there be exactly one global default provider/model, or one default model per provider plus env/global active provider?
- Should model capabilities be manually configured or probed automatically?
- What initial quality scoring method should be used before adding judge-model evaluation?
- What cron frequency is acceptable for paid providers if the default 6-hour cadence is too expensive?
