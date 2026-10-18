# 09 — Risks & issues

## Goal
Risk/issue register per project with exposure scoring and a cross-portfolio high-exposure view. Journey 3 (risk part): *a manager updates a risk with project-level visibility and appropriate validation.*

## Depends on
07-projects

## Spec references
Assignment 2 §2 module 03, §1 journey 3, §6 edge cases (closed high-exposure risk must not count as open).

## Scope — module `modules/risks/`

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/projects/:projectId/risks` | view | filters `type`, `status` (multi), `ownerId`, `minScore`, `q`; sort `score,dueDate,status`; paginated; computed `exposure` band |
| GET | `/api/v1/risks` | any (scoped) | cross-portfolio list with same filters + `projectId`, `departmentId`; used by dashboard drill-down |
| GET | `/api/v1/risks/high-exposure` | any (scoped) | `status <> 'closed' AND score >= 15`, sorted score desc, due asc |
| GET | `/api/v1/risks/:id` | view | |
| POST | `/api/v1/projects/:projectId/risks` | manage | `{ type, title, description?, ownerId, probability 1–5, impact 1–5, mitigation?, dueDate?, status? }`; owner must be a project member; **mitigation required when score ≥ 15** (422); audited |
| PATCH | `/api/v1/risks/:id` | manage | version; closing sets `closed_at`; reopening clears it; score recomputed by DB; mitigation rule re-checked; audited |

### Exposure bands (single definition, reused by dashboard)
`score ≥ 15` high · `8–14` medium · `≤ 7` low. Put the thresholds in one constant + mirror in SQL via a small `fn_exposure_band(score)` (migration `009_risk_band.sql`) so the risk matrix and Power BI agree.

## Tests (`integration/risks.test.ts`)
- High-exposure list includes the seeded open high risk and **excludes** the closed high risk.
- Contributor (member) POST/PATCH → 403; non-member GET → 404.
- probability 6 → 400; score ≥ 15 without mitigation → 422.
- Closing sets `closed_at`; stale version → 409.
- Scoped `/risks` for a contributor returns only member-project risks.

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Design rationale
Why score is a generated column; where the "high exposure" threshold lives and why it's defined once; why closed risks are excluded by status not by deleting.
