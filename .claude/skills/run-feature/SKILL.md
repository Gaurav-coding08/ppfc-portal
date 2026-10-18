---
name: run-feature
description: Implement exactly one feature spec from .claude/features (the next pending one, or the one named in the argument), verify it with typecheck/lint/tests, then write its context file and update progress. Use when the user says "run next feature", "run feature 05", or /run-feature.
argument-hint: "[feature number or file name, e.g. 05 or 05-auth] (optional — defaults to next pending)"
---

# Run one feature

You implement **one** feature file per run (or one **part** of it, see 1.5), then stop. Never start the next feature or part in the same run.

## 1. Pick the feature

1. Read `.claude/context/PROGRESS.md`. If it does not exist, create it from the files in `.claude/features/` whose names start with two digits (ignore `README.md`), sorted by number, all `pending`.
2. If `$ARGUMENTS` is given, select the feature whose file name starts with it. Otherwise select the lowest-numbered feature that is `pending` or `in_progress (…)`.
3. If any feature listed in its **Depends on** section is not `done`, stop and tell the user which one to run first.
4. Mark it `in_progress` in PROGRESS.md.
5. **Parts.** If the selected feature file has `## Part A`, `## Part B`… sections, implement **only the next unfinished part** in this run. Track it in PROGRESS.md as `in_progress (A done)`, `in_progress (A, B done)`. Mark the feature `done` only after its last part. `/run-feature 16` continues the next part of 16.

## 2. Load context (read, don't skim)

- `CLAUDE.md` (repo standards — they override anything in a feature file if they conflict; if a real conflict exists, stop and ask).
- The selected feature file in full.
- Every context file for its **Depends on** features: `.claude/context/<feature-file-name>.md`. Use these instead of re-reading the whole codebase; open source files only where the feature touches them.
- When continuing a part: this feature's own context file (earlier parts' notes).
- `docs/api-routes.md` if it exists. For frontend work, also the OpenAPI file.

## 3. Plan before code

Write a short plan in chat (files to create/modify, migrations, endpoints or pages, tests). If the feature file is ambiguous on something that changes the data model, the API contract, or a business rule, ask **one** question and wait. Otherwise proceed.

## 4. Implement

- Follow CLAUDE.md layering, conventions, error codes, RBAC pattern and financial definitions exactly. For frontend work, the CLAUDE.md Frontend section and design system are binding.
- Write the tests listed in the feature's **Tests** section (more is fine, fewer is not).
- Add/update route rows in `docs/api-routes.md` for every endpoint you add.
- Frontend work never adds backend endpoints. If a screen needs one that doesn't exist, stop and ask.
- Comment non-obvious logic: SQL aggregations, authorization decisions, state transitions, transaction boundaries, cache invalidation.
- Keep wording neutral everywhere you write for humans — code comments, context files, docs, and commit messages. Never use "interview", "talking point(s)", "take-home", "assignment", or "candidate". Put the _why_ behind a decision under a feature file's "## Design rationale" or a context file's "## Decisions & trade-offs" instead.

## 5. Verify (mandatory)

Run the gate for every area the feature or part touched:

- **Backend changed** → from `backend/`:
  ```
  npm run typecheck && npm run lint && npm test
  ```
- **Frontend changed** → from `frontend/`:
  ```
  npm run typecheck && npm run lint && npm test && npm run build
  ```
- **Frontend features** always also run the backend `npm test` once at the end, to prove no backend regression.

Also run every command in the feature's **Acceptance** section that applies to the part just built (Docker and E2E commands only when the part says so).

If something fails, fix the cause — never delete or weaken a test to make it pass. If you cannot fix it after two honest attempts, stop, leave the feature `in_progress`, and report the failure with the exact error.

## 6. Record

1. Write `.claude/context/<feature-file-name>.md` using the template below. Keep it under ~120 lines: it is what the _next_ feature reads instead of the code. **For a part**, append to the same context file under a `## Part <X>` heading instead of creating a new file.
2. Update `.claude/context/PROGRESS.md`: status (`done`, or `in_progress (A done)` for a part), date, test count.
3. Append an entry to `docs/ai-dev-log.md` (template below). For a part, use the heading `### <NN><Part> <Title>` (e.g. `### 16A Frontend foundation`). Record what actually happened: a real bug, a wrong first attempt, a failing test you fixed. If nothing went wrong, say so; do not invent issues. Leave the **Human review** line as `TODO (owner)` for the human to fill.
4. Commit once per feature or part with a conventional message, e.g. `feat(projects): list/create/update with scoped access`. Do not push.

## 7. Report and stop

Reply with: feature (and part) done, files touched (short list), endpoints or pages added, test results (pass count), anything deferred, and the exact command to run next.

For frontend work, also give a **click-through list**: the pages and flows the owner must check in the browser (URL, which demo login, what should happen). You cannot see the UI, so the owner's visual check is the final gate — say so.

Then stop.

---

## Context file template — `.claude/context/<feature-file-name>.md`

```markdown
# <NN> — <Title> (done <YYYY-MM-DD>)

## What exists now

<2–5 sentences: what this feature added to the system>

## Files

- path — one-line purpose

## Database

- tables/columns/constraints/indexes/functions added or changed (or "none")

## Endpoints / Pages

| Method or Route | Path | Roles | Notes |

## Reusable pieces (use these, don't rebuild)

- helper/function/component name — signature or props — what it does

## Decisions & trade-offs

- decision — why

## Known gaps / TODO for later features

- ...

## How to verify quickly

- commands / curl / test names / pages to open
```

## PROGRESS.md template

```markdown
# Progress

| #   | Feature file     | Status  | Date | Tests |
| --- | ---------------- | ------- | ---- | ----- |
| 01  | 01-project-setup | pending |      |       |
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
