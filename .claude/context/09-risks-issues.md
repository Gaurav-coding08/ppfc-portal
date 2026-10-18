# 09 — Risks & issues (done 2026-10-18)

## What exists now
Risk/issue register per project (`modules/risks/`), plus a cross-portfolio list and a
high-exposure drill-down (`GET /api/v1/risks`, `GET /api/v1/risks/high-exposure`) scoped to
the caller's visible projects. Exposure band (`high`/`medium`/`low`) is defined once in SQL
(`fn_exposure_band`) and mirrored by a JS constant for the pre-insert mitigation check. This
is the first feature to actually use `scopedProjectIdsSql` (feature 05), which feature 07's
context file had flagged as the right tool for exactly this shape of cross-portfolio query.

## Files
- `backend/db/migrations/013_risk_band.sql` — `fn_exposure_band(p_score SMALLINT)`
- `backend/src/modules/risks/risks.schemas.ts` — zod schemas for every endpoint
- `backend/src/modules/risks/risks.shared.ts` — `exposureBand`, `hasRequiredMitigation`,
  threshold constants (mirrors the SQL function)
- `backend/src/modules/risks/risks.repository.ts` — `listProjectRisks`, `listRisksScoped`
  (cross-portfolio, uses `scopedProjectIdsSql`), `listHighExposureRisks`, `findRiskById`,
  `findRawRiskById`; `RISK_COLUMNS`/`RISK_FROM` split like `tasks.repository.ts`'s
  `TASK_COLUMNS`/`TASK_FROM`
- `backend/src/modules/risks/risks.mutations.repository.ts` — `insertRisk`
- `backend/src/modules/risks/risks.service.ts` — list/get/create
- `backend/src/modules/risks/risks.update.service.ts` — PATCH (closing/reopening, mitigation
  re-check, owner-membership re-check)
- `backend/src/modules/risks/risks.controller.ts`, `risks.routes.ts` — two routers:
  `projectRisksRoutes` (mounted at `/api/v1/projects`) and `risksRoutes` (mounted at
  `/api/v1/risks`; `/high-exposure` registered before `/:id`)
- `backend/src/app.ts` — mounts both new routers
- `backend/tests/integration/risks.test.ts` — 19 tests
- `docs/api-routes.md`, `docs/data-dictionary.md` — new rows/function doc

## Database
- Migration 013: `fn_exposure_band(p_score SMALLINT) RETURNS TEXT` — no table/column changes.
  (The feature file named this migration `009_risk_band.sql`; migrations 009–012 were already
  taken by the time this feature ran, so it's `013_` instead — forward-only numbering, no
  renumbering of what's already applied.)

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET/POST | /api/v1/projects/:projectId/risks | view / manage | See `docs/api-routes.md`. |
| GET | /api/v1/risks | any (scoped) | Cross-portfolio; `projectId`/`departmentId` filters. |
| GET | /api/v1/risks/high-exposure | any (scoped) | `status <> 'closed' AND score >= 15`. |
| GET/PATCH | /api/v1/risks/:id | view / manage | |

## Reusable pieces (use these, don't rebuild)
- `scopedProjectIdsSql(caller)` (feature 05) — its SQL fragment hardcodes `$1` for the
  caller's user id, so its `params` **must be the first entries** in the query's params array;
  everything else appends from `params.length` after that. See `risks.repository.ts`'s
  `listRisksScoped`/`listHighExposureRisks` for the pattern.
- `risks.shared.ts#exposureBand(score)` / `hasRequiredMitigation(score, mitigation)` — the one
  place the 15/8 thresholds live in JS; call these rather than re-deriving the bands
- `membersRepo.findMemberRole` (feature 07) — reused again for "owner must be a project
  member", on both risk create and update

## Decisions & trade-offs
- **The mitigation-required rule is re-checked on every PATCH**, not only when `probability`/
  `impact`/`mitigation` actually change in that request — it's computed from the *effective*
  (current row merged with the patch) state regardless. This means a pre-existing row that
  already violates the rule (the seeded `FORCE_OPEN_HIGH_EXPOSURE` fixture: score 20, no
  mitigation, left that way deliberately by the generator) cannot be PATCHed at all —
  including just closing it — until a `mitigation` is supplied in the same request. Treated
  as correct: same as a DB CHECK constraint, an existing violating row is fine until someone
  tries to write a new version of it.
- **Owner-membership is re-validated on PATCH, not just create**, for the same reason tasks'
  assignee-membership check runs on both (feature 08) — consistency, not a narrower rule.
- **No project-date-range validation on a risk's `dueDate`** (unlike tasks/milestones) —
  the feature file's Tests/Scope sections never asked for it, so it wasn't added; raising it
  would be scope creep beyond what's specified.
- **`listRisksScoped`'s cross-portfolio query optionally joins `projects p`** only when
  `departmentId` is filtered — avoids an unconditional join (and the fan-out risk that comes
  with joining another one-row-per-project table) when nothing needs it.

## Known gaps / TODO for later features
- `fn_project_delivery_status` (feature 07, migration 012) still hardcodes its own
  `score >= 15` literal for the "open high-exposure risk" at_risk condition rather than
  calling `fn_exposure_band`. Not changed here — it only needs a boolean, not a band label,
  and migration 012 predates this one — but if the threshold ever moves, both need updating.
- Dashboard/analytics (feature 13) is the intended consumer of `fn_exposure_band` and
  `GET /risks/high-exposure` for portfolio-wide risk visualizations.

## How to verify quickly
```
cd backend
npm run typecheck && npm run lint && npm test   # 199 tests pass (19 new)
```
