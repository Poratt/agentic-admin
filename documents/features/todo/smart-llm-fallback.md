# Smart LLM Fallback — Circuit Breaker + Equivalence Routing + UI Notice

## Overview

Today every LLM call is single-shot: pick one `(provider, model)`, call it,
surface the error. The system already records real-usage stats per
provider/model (`LlmCallStatEntity`, surfaced in the Statistics tab as
`Real success %` / `Real avg latency` / `Most stable` / `Fastest`),
but the routing layer does not consume them. Free-tier endpoints hang
(observed 61-70 s in the stats table) and the user waits or the call
fails outright.

This feature makes the routing layer **dynamic and performance-aware**:
short timeouts, a circuit breaker that skips providers on repeated
failure, and automatic fallback to equivalent models across providers.
The user sees a small notice when their chosen model was swapped, but
the chat flow itself does not break.

## Goals

- **No 30-70 s hangs.** First-token timeout of 5 s and total-call
  timeout of 30 s, with an immediate transition to the next candidate
  on breach.
- **No flapping.** A provider/model that just failed 3 times in a row
  is in `cool-down` for 5 minutes — the router skips it without
  re-attempting.
- **Provider-level equivalence.** If `DeepSeek V4.1 Flash` on provider A
  fails with a transient error (5xx, 429, timeout), try the same model
  key on another active provider that hosts it.
- **Tier-level equivalence.** If the chosen model is unreachable and no
  provider-level equivalent exists, fall back to the current
  `Most stable` model of the same capability / tier (e.g. "Flash tier
  text model").
- **Visible to the user, not a popup.** The chat message carries a small
  `הופק באמצעות X (במקום Y עקב עומס)` notice. No modal, no toast.
- **Stats loop is closed.** Every fallback decision is recorded as a
  normal `LlmCallStatEntity` row with the actual model that served the
  call, and as a new `LlmFallbackEventEntity` row with the original
  model, the served model, the reason, and the chain length.

## Out of scope

- Cross-capability fallback (text model fails → use image model). Wrong
  shape of answer; out of scope here.
- Model-quality re-ranking (LLM-as-judge). Backlog.
- Auto-tagging tiers ("Flash / Pro / Thinking") by admin UI. The
  current `capability` enum (`text` / `image` / `video`) is the
  only tier signal until tier-tagging is added; see Open Decisions.
- Web-search / agent-tool fallback. Different retry semantics; out of
  scope here.

---

## Phase 0: Research & Preparation (2h)

### Goals

Pin every assumption to a real line in the code before changing routing
semantics.

### Checklist

- [ ] Read `~/.CLAUDE/rules/nestjs-rules.md`
- [ ] Read `LlmClientService.generateResponse` and `generateStream` end
      to end. Identify the exact point a timeout should be enforced
      (Promise.race against an `AbortController`? setTimeout on the
      fetch? `AbortSignal.timeout(ms)`?). Note any existing retry logic
      (the 429 `Retry-After` single-retry in `createVideoTask` and the
      503 `video_queue_full` retry — these are local to their own
      methods; this feature is cross-method)
- [ ] Read `LlmProviderConfigService.getRuntimeSelection` — the single
      point that turns `(provider, model)` into the actual URL/headers
      used for the call. The fallback router wraps THIS, not the raw
      HTTP call
- [ ] Read the Statistics tab controller / service
      (`LlmProviderController_getStats` or whatever the post-2026-09-13
      catalog-toolbar code calls it). Confirm the
      `rankingBasis` / `fastestId` / `mostStableId` already encode
      "current best" — the fallback router will consume these, not
      recompute them
- [ ] Read `LlmCallStatEntity` and the call path from
      `LlmClientService.generateResponse` to `saveCallStat`. Confirm
      `caller: 'chat' | 'agent' | 'image' | 'video' | 'health'`
      already covers all real call sites — fallback should add a new
      value `caller: 'chat-fallback'` (or a separate `isFallback: bool`
      column) so the rankingBasis query can either include or exclude
      fallback traffic
- [ ] Read the chat streaming controller / DTO and the chat message
      shape so the notice can be attached to the assistant message
      (probably as a new field on the streaming SSE chunk, then
      surfaced in the chat-history row)
- [ ] Read the existing `LlmFallbackEventEntity` (if any) or plan the
      new entity
- [ ] Read `documents/architecture-diagram.md` to confirm this change
      adds a new module boundary (`LlmRouterService` between the
      controller and `LlmClientService`) and update the diagram in
      Phase 5
- [ ] Find one existing nearby pattern to follow: the
      `2026-08-19 ✅ FIXED: agent auth loop` change is the closest
      precedent (small fallback / breaker logic wrapped around an
      existing call site). Use its structure

### Deliverable

A short pre-flight note covering:

- Exact lines / symbols to change in each of: `LlmClientService`,
  `LlmProviderConfigService`, the chat controller, the
  `LlmCallStatEntity` / `LlmFallbackEventEntity` definitions, the
  streaming chunk DTO, the Statistics tab contract
- Confirmed answer to: "is `LlmFallbackEventEntity` already a thing or
  does it need to be created?"
- The new SSE chunk field name (`fallbackNotice`? `routedTo`?) and
  whether the chat-history row needs a denormalized column
- Whether the breaker is in-process (Map in a singleton service) or
  DB-backed (shared across backend restarts). Default: in-process; the
  stats already give us post-restart signal

### Time estimate: 2 hours

---

## Phase 1: Core fallback router (4h)

### Goals

A new `LlmRouterService` sits between the controller layer and
`LlmClientService`. It receives the requested
`(provider, model, prompt, systemContext, caller, signal)`, walks a
chain of candidates, returns the first success, and records both the
result and the path it took.

### Checklist

- [ ] New file `backend/src/modules/llm/services/llm-router.service.ts`:
  - `route(req: RouteRequest): Promise<RouteResult>`
  - `RouteResult = { response, fallbackChain: FallbackStep[] }`
  - `FallbackStep = { fromProvider, fromModel, toProvider, toModel, reason, latencyMs }`
- [ ] `buildFallbackChain(requested, allActiveModels)`:
  1. **Same key, different provider** — every `LlmModelEntity` with the
     same `key` (case-insensitive, ignore `~` prefix variant
     identifier from 2026-09-12 catalog sync) and `active = true`
  2. **Same capability + tier** — every active `text` model with a
     `tier` tag matching the requested model's tier (default tier =
     `'standard'` until Phase 4 introduces a real tag); the order
     is `Most stable` first, then lowest `Real avg latency`, then
     `Fastest` — pulled from the existing Statistics endpoint
  3. **Same capability, any tier** — fallback if (1) and (2) are empty
- [ ] Per-candidate invocation:
  - Wrap `LlmClientService.generateResponse` in
    `Promise.race` with a 30 s ceiling + a 5 s first-token
    ceiling for streams
  - On `AbortError` / `TimeoutError` / 5xx / 429 → mark as
    transient, increment breaker counter for `(provider, model)`,
    move to next candidate
  - On 4xx (other than 429) → non-transient; record the failure
    with reason `'non_transient_4xx'` and return the error to the
    caller (no fallback — the user typed something the model
    rejected, retrying with another model will reject the same way)
  - On success → reset the breaker counter for `(provider, model)`,
    record the path, return the response
- [ ] Breaker state: in-process `Map<string, BreakerState>` keyed by
  `${providerKey}:${modelKey}`. `BreakerState = { failures, openedAt }`.
  - `failures >= 3` within 60 s → `openedAt = now`, route skips the
    key
  - `now - openedAt >= 5 min` → state cleared (half-open: next call
    decides)
  - Expose a debug endpoint `GET /llm/breaker-state` (admin only)
    to inspect the in-memory map during a live incident
- [ ] Recording:
  - Every attempt → normal `saveCallStat` row (no new column
    required; just an honest record of the call)
  - Every fallback path → `LlmFallbackEventEntity` row:
    `{ originalProviderKey, originalModelKey, servedProviderKey, servedModelKey, reason, chainLength, caller, createdAt }`
  - Set a `correlationId` (UUID v4) on `RouteRequest` so the
    controller, the SSE chunk, and the chat-history row can be
    traced end to end

### Files

- `backend/src/modules/llm/services/llm-router.service.ts` (new)
- `backend/src/modules/llm/llm.module.ts` (register provider)
- `backend/src/modules/llm/services/llm-router.service.spec.ts` (new)
- Possibly
  `backend/src/modules/llm-provider/entities/llm-fallback-event.entity.ts`
  (new — confirm in Phase 0)

### Time estimate: 4 hours

---

## Phase 2: Wire the router into real call sites (3h)

### Goals

Every text-chat and image-generation call goes through
`LlmRouterService` instead of straight to `LlmClientService`. Video
calls and embedding calls are unchanged for this phase (different
shape of error; revisit when a real pain point appears).

### Checklist

- [ ] `LlmController.generateImage` — swap direct
      `client.generateImage` for `router.route(...)`. Carry the
      `correlationId` into the response body
- [ ] `LlmController.generateStream` — swap direct
      `client.generateStream` for a `router.stream(...)` that returns
      an `AsyncIterable` and yields a new chunk shape:
      `{ delta: string, fallbackNotice?: FallbackStep[] }` once at
      the start of the stream if any fallback happened
- [ ] `LlmController.generateResponse` — same swap; same correlation
      pattern; the JSON response includes
      `fallbackChain: FallbackStep[]` (empty array on first-try
      success)
- [ ] `AdminAgentService` — every call into the LLM for agent
      planning / tool calls also goes through the router. The agent
      loop is the one place where long hangs are most visible;
      `caller: 'agent'` is the new label
- [ ] `createVideoTask` — explicitly NOT in this phase. The
      pre-existing 429 `Retry-After` and 503 `video_queue_full`
      retries cover the most common video failures; adding the
      router here would force a `LlmModel` lookup on a model that
      might not be a "video" model in our DB (Agnes video is a
      virtual provider). Backlog
- [ ] `LlmHealthService.testLlm` — explicitly NOT in this phase.
      Health checks are a *probe*, not a user call. The router is
      for "I need a result now"; testing wants to test a specific
      model. Backlog
- [ ] Update `documents/architecture-diagram.md`: insert
      `LlmRouterService` between the LLM controllers and
      `LlmClientService`, and add the `LlmFallbackEventEntity` to
      the database subgraph

### Files

- `backend/src/modules/llm/llm.controller.ts` (text + image + stream)
- `backend/src/modules/llm/services/llm-client.service.ts` (no change
  beyond accepting an external `AbortSignal` from the router)
- `backend/src/modules/admin-agent/admin-agent.service.ts`
- `backend/src/modules/llm/dto/generate-image.dto.ts` (add
  `correlationId`?)
- `documents/architecture-diagram.md`

### Time estimate: 3 hours

---

## Phase 3: Chat UX — surface the fallback notice (2h)

### Goals

When a chat call took a fallback path, the assistant message carries
a small `הופק באמצעות X (במקום Y עקב עומס)` notice. No modal, no
toast, no error popup. The message is still delivered; the user
knows what happened and can choose to retry with their original
model if they want.

### Checklist

- [ ] Frontend SSE / streaming consumer: parse the new
      `fallbackNotice` chunk field. Keep the chain for the message
      record but render only the first hop in the chat (one line is
      enough)
- [ ] `chat-message` component: new
      `.fallback-notice` element under the assistant avatar
      (or beside the model badge). Styled as muted caption text,
      `font-size-xxs`, with a small `ph-arrow-u-up-left` icon
- [ ] Copy: `הופק באמצעות {servedModel} (במקום {originalModel} עקב
      עומס)`. The reason text is server-driven; for now the only
      values are `'overloaded'` (429 / breaker open), `'timeout'`,
      `'provider_error'` (5xx). The frontend renders the matching
      Hebrew label from a small map
- [ ] On hover: tooltip with the full chain
      (`Original → A (timeout) → B (overloaded) → C ✅`). The chain
      comes from the SSE chunk; tooltip is the global
      `tooltip-card` glassmorphism pattern
- [ ] Persist the chain in the chat-history row so reloading the
      page still shows the notice. Either:
  - denormalize the original / served / chain into a new
    `chat_messages.fallback_summary` column (TEXT), or
  - keep the chat_history pointing at the
    `LlmFallbackEventEntity` by `correlationId` and join on
    reload
  - Pick the denormalized column for cheap reloads; record the
    choice in `LOG.md`
- [ ] No notice on first-try success — verified by spec
- [ ] Add 1 component spec: render with a `fallbackChain.length
      > 0` and verify the notice appears; render with an empty
      chain and verify it does not appear

### Files

- `frontend/src/app/features/chat/chat.ts` (parse new chunk field)
- `frontend/src/app/features/chat/chat-message/chat-message.ts`
- `frontend/src/app/features/chat/chat-message/chat-message.html`
- `frontend/src/app/features/chat/chat-message/chat-message.css`
  (or the existing shared file)
- `frontend/src/app/features/chat/chat-message/chat-message.spec.ts`
- Possibly a migration for `chat_messages.fallback_summary` (decide
  in Phase 0)

### Time estimate: 2 hours

---

## Phase 4: Tier tags on `LlmModelEntity` (2h, gated on user input)

### Goals

Phase 1's "same tier" fallback uses a tier string. Today the
`LlmModelEntity` has no such field — every text model is in the same
implicit bucket. This phase adds a `tier` column with a small set of
values, seeds it from a one-time mapping, and lets admin users
override it per model.

### Checklist

- [ ] New column on `LlmModelEntity`:
      `tier: 'flash' | 'standard' | 'pro' | 'thinking'` (default
      `'standard'`)
- [ ] Migration: add the column with the default; one-time seed
      pass that maps known model keys:
  - `gpt-5-nano`, `gemini-2.0-flash`, `claude-haiku-*`,
    `*-flash*`, `*-mini*` → `'flash'`
  - `gpt-5`, `claude-sonnet-*`, `gemini-2.5-pro` → `'standard'`
  - `gpt-5-pro`, `claude-opus-*`, `o1`, `o3` → `'pro'`
  - `o1`, `o3`, `gemini-2.5-thinking*`, `*-thinking*` →
    `'thinking'`
  - Anything unmatched → `'standard'` (no fallback impact)
- [ ] Admin UI: per-model tier dropdown in the LLM Providers
      management page (next to the existing `capability` field, same
      `p-toggleswitch`/`p-select` pattern)
- [ ] The router's "same tier" fallback path consumes the new
      `tier` value. Stats rankingBasis gains a tier dimension if
      cheap (one new index on `(tier, success_rate)`)

> **Gating decision:** the user asked for "Most stable" fallback
> "from the same category" — without a `tier` field, the only
> available signal is `capability`. Phase 1 can ship with just
> `capability`-based fallback (still useful), and Phase 4 is the
> later refinement. **Default: ship Phase 4 together with Phase 1
> so the UX message is honest on day one.**

### Files

- `backend/src/modules/llm-provider/entities/llm-model.entity.ts`
  (add column)
- New migration
- `backend/src/modules/llm-provider/seeds/llm-providers.seed.ts`
  (one-time tier assignment)
- `frontend/src/app/features/llm-providers-management/llm-providers-management.ts/html`
  (tier dropdown)
- `backend/src/modules/llm-provider/llm-provider.service.ts` (stats
  ranking if cheap)

### Time estimate: 2 hours

---

## Phase 5: Statistics tab — expose the fallback story (1.5h)

### Goals

Operators can see *how often* the router had to fall back, and *which
routes* are most often used. This is what closes the loop on the
existing `Most stable` / `Fastest` cards — those numbers are now
weighted by "actual call" not "raw response time".

### Checklist

- [ ] New `LlmFallbackEventEntity` rows: add a
      `GET /llm-provider/fallback-stats?days=7` endpoint that
      returns:
  - `totalFallbacks` (count of `LlmFallbackEventEntity` rows in
    window)
  - `byReason` (`{ overloaded: 12, timeout: 7, provider_error: 3 }`)
  - `topRoutes` (`[{ from: 'A:B', to: 'C:D', count: 9 }]`)
  - `avgChainLength` (mean of `chainLength` column)
- [ ] Statistics tab: a new collapsible section "Fallback activity
      (last 7 days)" with the four numbers above + a small bar
      chart for `byReason`. Same glassmorphism card pattern as the
      rest of the tab
- [ ] A "Show why" button on the existing `Most stable` /
      `Fastest` cards: tooltip or popover with the fallback
      activity for that model. This is the explicit "you trusted
      this label, here's how often it was chosen because the
      primary failed" disclosure
- [ ] Update the swagger summary for the stats endpoint so the
      user knows the numbers include fallback traffic (or exclude
      it, depending on the Phase 1 decision)
- [ ] Spec: a unit test for the fallback-stats endpoint with three
      sample rows

### Files

- `backend/src/modules/llm-provider/llm-provider.controller.ts`
  (new endpoint)
- `backend/src/modules/llm-provider/llm-provider.service.ts` (query)
- `backend/src/modules/llm-provider/llm-provider.controller.spec.ts`
- `frontend/src/app/features/llm-providers-management/llm-providers-management.html/ts`
  (render the new section)

### Time estimate: 1.5 hours

---

## Phase 6: Documentation (0.5h)

### Checklist

- [ ] `documents/HANDOFF.md` — new "✅ DONE" entry: list of new
      behaviors, new endpoints, new entity, files touched
- [ ] `documents/STATUS.md` — top entry
- [ ] `documents/LOG.md` — record: in-process breaker (not
      DB-backed) + reasoning; tier-tag default seeding rule
- [ ] `documents/architecture-diagram.md` — Phase 2's update
      + add `LlmFallbackEventEntity` to the Data subgraph
- [ ] Move this file from `features/todo/` to `features/done/`
- [ ] `README.md` of the project (if it documents the chat flow) —
      note that "transient provider failures now auto-route to an
      equivalent model"

### Time estimate: 30 minutes

---

## Total Time Summary

| Phase | Description                                      | Time   |
| ----- | ------------------------------------------------ | ------ |
| 0     | Research & Preparation                           | 2h     |
| 1     | Core fallback router + breaker                   | 4h     |
| 2     | Wire router into chat / image / agent            | 3h     |
| 3     | Chat UX — fallback notice                        | 2h     |
| 4     | Tier tags on `LlmModelEntity`                    | 2h     |
| 5     | Statistics tab — fallback story                  | 1.5h   |
| 6     | Documentation                                    | 0.5h   |
| **Total** |                                              | **15h** |

---

## Open Decisions (before starting Phase 1)

| Question | Option A | Option B | Note |
| -------- | -------- | -------- | ---- |
| **Tier source for fallback ranking** | Add `tier` column on `LlmModelEntity` (Phase 4) | Use `capability` only until Phase 4 lands | A is honest day-one; B is cheaper but the "same category" claim is fuzzy |
| **Fallback-stat entity** | New `LlmFallbackEventEntity` | Reuse `LlmCallStatEntity` with a new `was_fallback` column | A keeps the audit story clean; B is one less table |
| **Persistence of chain in chat history** | Denormalize `fallback_summary` column on `chat_messages` | Join via `correlationId` to `LlmFallbackEventEntity` | A is one SELECT; B is one more JOIN on every reload |
| **4xx handling** | No fallback — return the error to the caller | Always fall back | A is honest; B hides model-side rejection bugs |
| **First-token timeout for streams** | 5 s | 10 s | A is the "free tier" sweet spot; B is more forgiving |
| **Total timeout for streams** | 30 s | 60 s | A matches the existing 2026-08-20 retry ceiling; B is what users expect for paid tiers |
| **Breaker persistence** | In-process (loses state on restart) | DB-backed (survives restart, but every restart reads stale cooldowns) | A is the standard pattern; B is for very high-traffic systems |
| **Image generation on fallback** | Allowed: if `Flux Pro` fails, try `GPT-Image-1` (different output modality) | Not allowed: image-only image-capable models | A is more helpful; B preserves the output shape |
| **Fallback stats in the Statistics tab** | Show alongside real-usage stats | Separate "Fallback activity" section | A is one less click; B is more honest about what the number means |

---

## Success Criteria

1. `npm run test -w backend` — passes with new specs
2. `npm run build -w backend` — exit 0
3. `npx ng test --watch=false` (from `frontend/`) — passes
4. `npx ng build` (from `frontend/`) — exit 0
5. Empirically (live on `:3000`):
   - Open chat, send a message while a model is known-down (flip its
     `active` to `false` temporarily, or wait for a known-flaky free
     tier model). The reply arrives within ~5-10 s, with the
     `הופק באמצעות X (במקום Y עקב עומס)` notice visible
   - Send 3 messages in a row while a single provider is in
     `cool-down`. The 2nd and 3rd skip the cool-down provider
     entirely (verified via `GET /llm/breaker-state`)
   - The Statistics tab shows a non-empty "Fallback activity
     (last 7 days)" section with the four numbers
6. `git diff --check` clean, no mojibake
7. `graphify update .` run after the change
8. `documents/architecture-diagram.md` updated (the
   `LlmRouterService` and the new entity are visible in the diagram)
9. `documents/HANDOFF.md` and `documents/STATUS.md` updated before
   the final response
10. The chat 2026-08-19 auth-loop / consent-flow fixes still pass
    (no regression in the agent tool path)

---

## Backlog (not in scope here)

- Fallback for `createVideoTask` (different retry shape; revisit
  when a real video outage happens)
- Fallback for `LlmHealthService.testLlm` (testing wants a specific
  model, not a fallback)
- LLM-as-judge model quality re-ranking
- Auto-tier suggestion from observed latency (instead of admin-tagged)
- Cross-capability fallback (text → image for "describe this picture"
  prompts) — wrong shape of answer; revisit only if a real user
  request comes in
- Per-user fallback preferences (some users may want hard-fail over
  silent swap)
