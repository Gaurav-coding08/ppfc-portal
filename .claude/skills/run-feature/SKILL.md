---
name: run-feature
description: Implement exactly one feature spec from .claude/features (the next pending one, or the one named in the argument), verify it with typecheck/lint/tests, then write its context file and update progress. Use when the user says "run next feature", "run feature 05", or /run-feature.
argument-hint: "[feature number or file name, e.g. 05 or 05-auth] (optional — defaults to next pending)"
---

# Run one feature

You implement **one** feature file per run, then stop. Never start the next feature in the same run.

## 1. Pick the feature

1. Read `.claude/context/PROGRESS.md`. If it does not exist, create it from the files in `.claude/features/` whose names start with two digits (ignore `README.md`), sorted by number, all `pending`.
2. If `$ARGUMENTS` is given, select the feature whose file name starts with it. Otherwise select the lowest-numbered `pending` feature.
3. If any feature listed in its **Depends on** section is not `done`, stop and tell the user which one to run first.
4. Mark it `in_progress` in PROGRESS.md.

## 2. Load context (read, don't skim)

- `CLAUDE.md` (repo standards — they override anything in a feature file if they conflict; if a real conflict exists, stop and ask).
- The selected feature file in full.
- Every context file for its **Depends on** features: `.claude/context/<feature-file-name>.md`. Use these instead of re-reading the whole codebase; open source files only where the feature touches them.
- `docs/api-routes.md` if it exists.

## 3. Plan before code

Write a short plan in chat (files to create/modify, migrations, endpoints, tests). If the feature file is ambiguous on something that changes the data model, the API contract, or a business rule, ask **one** question and wait. Otherwise proceed.

## 4. Implement

- Follow CLAUDE.md layering, conventions, error codes, RBAC pattern and financial definitions exactly.
- Write the tests listed in the feature's **Tests** section (more is fine, fewer is not).
- Add/update route rows in `docs/api-routes.md` for every endpoint you add.
- Comment non-obvious logic: SQL aggregations, authorization decisions, state transitions, transaction boundaries.

## 5. Verify (mandatory)

Run from `backend/` (after feature 01 exists):

```
npm run typecheck
npm run lint
npm test
```

Also run every command in the feature's **Acceptance** section. If something fails, fix the cause — never delete or weaken a test to make it pass. If you cannot fix it after two honest attempts, stop, leave the feature `in_progress`, and report the failure with the exact error.

## 6. Record

1. Write `.claude/context/<feature-file-name>.md` using the template below. Keep it under ~120 lines: it is what the *next* feature reads instead of the code.
2. Update `.claude/context/PROGRESS.md`: status `done`, date, test count.
3. Append an entry to `docs/ai-dev-log.md` (template below). Record what actually happened: a real bug, a wrong first attempt, a failing test you fixed. If nothing went wrong, say so; do not invent issues. Leave the **Human review** line as `TODO (owner)` for the human to fill.
4. Commit with a conventional message, e.g. `feat(projects): list/create/update with scoped access`. Do not push.

## 7. Report and stop

Reply with: feature done, files touched (short list), endpoints added, test results (pass count), anything deferred, and the exact command to run the next feature. Then stop.

---

## Context file template — `.claude/context/<feature-file-name>.md`

```markdown
# <NN> — <Title> (done <YYYY-MM-DD>)

## What exists now
<2–5 sentences: what this feature added to the system>

## Files
- path — one-line purpose

## Database
- tables/columns/constraints/indexes/functions added or changed

## Endpoints
| Method | Path | Roles | Notes |

## Reusable pieces (use these, don't rebuild)
- helper/function name — signature — what it does

## Decisions & trade-offs
- decision — why

## Known gaps / TODO for later features
- ...

## How to verify quickly
- commands / curl / test names
```

## PROGRESS.md template

```markdown
# Progress
| # | Feature file | Status | Date | Tests |
|---|---|---|---|---|
| 01 | 01-project-setup | pending | | |
```

## AI dev log entry template — append to `docs/ai-dev-log.md`

```markdown
### <NN> <Title> — <YYYY-MM-DD>
- **Goal:** <requirement from the feature file>
- **Prompt/approach:** /run-feature <NN> with feature spec + CLAUDE.md
- **First output issue:** <real issue found during build/verify, or "none found">
- **Refinement:** <what was changed and why>
- **Verification:** <tests/commands run and result>
- **Human review:** TODO (owner)
```
