# Claude Code Project Guide — Porat Monorepo

## Response Language

Conversation responses will be in Hebrew or English — according to the language the user wrote their last message in, or the language used in the recent context. It is strictly forbidden to respond in any third language (such as Chinese) — if this happens by mistake, stop immediately and restart in the correct language (Hebrew/English).

## Project Overview

Full-stack monorepo: Angular 22 frontend + NestJS backend.

Frontend platform baseline:

- Angular `22.0.1`
- Angular CLI `22.0.1`
- TypeScript `6.0.3`
- Node.js `22.22.3+` or `24.15.0+`
- PrimeNG is currently `21.1.8`; its Angular 22 peer dependency mismatch is a known open risk.

## Directory Structure

- `frontend/src/app/components/` — Reusable presentation components
- `frontend/src/app/features/` — Feature modules and smart components
- `frontend/src/app/core/services/` — API clients
- `frontend/src/app/core/stores/` — Signal Stores
- `frontend/src/app/assets/styles/` — Global styles and `_variables.css`
- `backend/src/modules/` — Feature modules (Controller + Service + Entity)
- `backend/src/core/` — Database and environment configurations

## Build & Dev Commands

Run frontend verification commands from `frontend/` unless a task explicitly says otherwise.
Do not use `npx ng build frontend` unless the workspace command is known to support that project argument.

| Action         | Command                        |
| -------------- | ------------------------------ |
| Frontend dev   | `npx ng serve`                 |
| Backend dev    | `npm run start:dev -w backend` |
| Frontend lint  | `npx ng lint`                  |
| Backend lint   | `npm run lint -w backend`      |
| Frontend test  | `npx ng test --watch=false`    |
| Frontend build | `npx ng build`                 |
| Backend test   | `npm run test -w backend`      |

## Rules Index

- Angular rules @`~/.CLAUDE/rules/angular-rules.md`
- NestJS rules @`~/.CLAUDE/rules/nestjs-rules.md`
- File editing: @`~/.CLAUDE/rules/str-replace.md`
- CSS: @`~/.CLAUDE/rules/css-rules.md`

## Core Principles

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- **Analyze the 'blast radius'**: Ask "What unexpected side effects could this have on unrelated parts of the system?" and "Could this change break something elsewhere?"
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Mandatory Pre-Flight Checklist

Before editing any file, the agent MUST:

1. Read the relevant local project guide:
   - Any directly relevant skill/rule file for the file type being changed
2. Identify the change type:
   - Angular component
   - Angular service
   - Angular store
   - CSS/global styles
   - NestJS controller/service/DTO
   - Other
3. State the applicable rules before implementation.
4. Find one existing nearby project example and follow its pattern.
5. Define success criteria and verification command.
6. Only then edit files.

For Angular page components with async loading/error/empty/ready states, this is mandatory.
Static placeholder pages do not need `PageStates`.

For the full `PageStates` pattern, template snippet, CSS rules, and Angular Definition Of Done, see `~/.CLAUDE/rules/angular-rules.md`.

If the agent cannot identify the applicable pattern, it must stop and ask before editing.

## UTF-8 / Hebrew Safety Rule

When editing files that contain Hebrew text:

1. Always read the file with UTF-8 encoding before editing.
2. Hebrew text is allowed.
3. Preserve user-facing Hebrew text exactly when editing existing Hebrew.
4. Never copy Hebrew text from terminal output that appears corrupted.
5. After editing, verify the file with UTF-8 reading.
6. Search for corrupted characters before finishing if Hebrew looks suspicious:

```bash
rg -n "׳|ג€�|ג†|ג€|�" path/to/file
```

If actual mojibake is found, fix it before running build or returning the answer.

## File Editing Safety Rule

Before using `str_replace` on any file:

1. **Always `Read` the file first** — get the exact current content, never rely on memory.
2. If `str_replace` fails once — re-read the file and try again with corrected `old_str`.
3. If `str_replace` fails **twice on the same file** — stop. Report what failed and ask the user.
4. **Never rewrite an entire file** to work around a failed `str_replace`. Rewriting is always wrong unless the user explicitly asked for it.
5. After a successful edit, re-read the changed section to verify correctness.

**The rule:** Read → Edit → Verify. Never guess at file content.

## 🔴 Golden Rules

1. Run tests BEFORE any refactoring: `npx ng test --watch=false` (from `frontend/`)
2. Every API change touches both sides: frontend service AND backend controller
3. No hardcoded CSS — only `var(--token)` from `_variables.css`, Generic global style High Priority - Came first.
4. Enums always start from `1`, never `0`
5. Prettier runs automatically via Hook — do not run manually
6. `tsconfig.app.json` include must be `src/**/*.ts` — never `src/**/*.d.ts`
7. **Tests/builds always run in non-watch / CI mode, with workers capped** (incident 2026-09-18): when running tests or builds, always ensure they run in non-watch / CI mode (e.g., use `vitest run`, `jest --watchAll=false --runInBand`, etc.) and do not leave background processes hanging. The backend jest config caps `maxWorkers` at `2` — but for AGENT runs prefer `jest --watchAll=false --runInBand` (one serial Node process; even two ts-jest workers compile TypeScript per-file in memory and can eat GBs). Never run one jest build while another is running, never override the cap upward, never fork suites in the background, and kill orphaned node workers before re-running.

## Session Management (MANDATORY)

### At Session Start

Before doing anything else, read:

1. `documents/HANDOFF.md` — where we left off
2. `documents/STATUS.md` — current task status

If working on a specific feature, also read:

- `documents/todo/<feature-name>.md` — feature plan
- `documents/incomplete/<feature-name>.md` — if paused mid-work

Then confirm to the user: "Loaded context: [what you understood]"

### At Session End

Before responding with final answer, update:

1. **`documents/HANDOFF.md`** — fill ALL sections:
   - What was done this session
   - The exact next step (specific file + action)
   - Files that were touched
   - Decisions made
   - Open questions for the user

2. **`documents/STATUS.md`** — move tasks between sections if status changed

3. **`documents/LOG.md`** — add any architectural decisions made this session

4. When a feature from `todo/` is complete:
   - Move its `.md` file to `documents/done/`
   - Update `STATUS.md` accordingly

### Verification Gate (HARD RULE)

Never mark a task as DONE and never close a session unless **all** of the following are true:

1. The relevant verification command ran and exited with code `0`:
   - Frontend change: `npx ng test --watch=false` (from `frontend/`) and/or `npx ng build`
   - Backend change: `npm run test -w backend` and/or `npm run build -w backend`
   - CSS-only change: `npx ng build` (from `frontend/`)
2. The verification output (command + exit code + summary) is included in the final report.
3. Pre-existing failures are explicitly distinguished from new ones.
4. `documents/HANDOFF.md` and `documents/STATUS.md` were updated before the final answer.

If verification fails or was skipped, the task **is NOT DONE**. Report the failure and the next step.

### Feature Work Flow

```
todo/<feature>.md        ← active work
incomplete/<feature>.md  ← paused (add reason + resume point)
done/<feature>.md        ← completed
```

## Playwright Testing / Browser Rules

- Always use `data-testid` attributes — never `[ref=...]`
- Verify URL with `browser_snapshot` before every action
- Call `browser_wait_for` after navigation for Angular stability
- Use headless mode only
- One browser action at a time, confirm before next
- If session exceeds 15 tool calls, start fresh with /clear

## Environment Notes

- node --version may fail in sandbox — use `npx node --version` instead
- Always verify environment via build output, not direct CLI checks

## Documentation

- Use context7 when writing code that involves third-party library APIs

### Architecture Diagram Maintenance

Before finishing any backend/frontend architectural change, check whether `documents/architecture-diagram.md` needs an update.

Update `documents/architecture-diagram.md` whenever a change affects system architecture, module boundaries, request flow, tool execution flow, GenUI rendering, LLM/model selection, database entities, or external provider integrations.

If the change does not affect the architecture diagram, mention that explicitly in the final response.

- **Sub-Agents for Scale:** For multi-step or complex tasks, spawn specialized sub-agents to parallelize work (e.g., one for backend DTO/Controller, one for frontend UI). The primary agent must review and integrate their diffs.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
