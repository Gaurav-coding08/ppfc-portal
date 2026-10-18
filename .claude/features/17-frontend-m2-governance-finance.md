# 17 — Frontend Milestone 2: risks, change requests & finance

## Goal
The governance and money screens: the risk register, the full change-request approval workflow with history, and finance as an operational module (budgets, revisions, categories, draft→posted costs, reversals, forecasts, summaries, alerts, comparison). Covers business journeys **3** (risk part), **4** and **5**, and acceptance tests **B**, **C** and the UI side of **D**.

## Depends on
16-frontend-m1-foundation-delivery

## Spec references
Assignment 2 §1 journeys 3–5, §2 modules 03, 04, 05, §3.1, §3.2 (double submission), §4 (all capabilities + financial definitions), §10 tests B, C, D.

## Read first
CLAUDE.md (Frontend section), context files 09-risks-issues, 10-change-requests, 11-finance-budgets-costs, 12-finance-forecasts-insights, 16-frontend-m1-foundation-delivery (reuse its kit — do not build a second table/form/badge), and the OpenAPI file.

Implement **one part per run**.

---

## Part A — Risks (module 03) & change requests (module 04)

**Risks**
- Project **Risks tab** + portfolio `/risks` page (scoped list with project/department filters) + `/risks/high-exposure` view (open, score ≥ 15, sorted score desc).
- Columns: type, title, owner, probability, impact, **score**, exposure badge, status, due date, mitigation (truncated).
- Create/edit (PM/Admin): type, title, description, owner (project members), probability 1–5, impact 1–5, mitigation, due date, status. Show the resulting score and band **as a read-only preview** of the backend rule (label it "calculated on save"); the saved value always comes from the API.
- Mitigation becomes visibly required when probability × impact ≥ 15; still rely on the backend 422 and show its message inline. Explain on the form that unmitigated high risks can't be updated until a mitigation is recorded (feature 09 rule).
- Closing a risk: confirm dialog; closed risks shown muted and excluded from the high-exposure view (backend does it — just display).

**Change requests**
- `/change-requests` list (scoped): code, project, title, requester, status, submitted date; filters status (multi), project, "Mine", date range.
- Project **Change requests tab** with "Submit change" for any member (contributors included).
- **Detail page:** CR fields + **history timeline** (status from → to, actor, reason, timestamp) from the API.
- **Decision panel** for eligible reviewers: Approve / Reject / Return, reason required, ConfirmDialog stating the consequence, `Idempotency-Key` generated when the panel opens, button disabled while pending. If the current user is the requester, show the panel disabled with "You can't decide your own request" — but still handle the backend 422 `SELF_APPROVAL` if called.
- Terminal states (approved/rejected) show no actions. 409 `INVALID_TRANSITION` → toast with message and refetch.
- **Resubmit** (requester, from returned): edit title/description and resubmit.
- Note on approved CRs: "Approval does not change budget or costs" (spec §4).
- After any decision: invalidate CR list/detail, project activity and dashboard keys.

**Part A tests:** risk form shows mitigation required at score ≥ 15 and surfaces a backend 422 inline; high-exposure view renders only what the API returns; CR decision requires a reason; decision panel disabled for requester; double-click on Approve sends exactly one request (msw call count) with an Idempotency-Key header; 403 from the decision endpoint shows the ForbiddenState/toast with requestId.

## Part B — Financial management (module 05)

All numbers come from the API. The frontend formats; it never adds, subtracts or divides money.

- **Project Finance tab** (the core screen):
  - **Summary cards:** current approved budget, actual spend, remaining budget, utilization %, forecast to complete, EAC, projected variance — with "as of" date and a one-line definition tooltip per card (copy the definitions from CLAUDE.md financial definitions).
  - **Alerts strip:** any alerts for the project (overrun forecast, near budget, overspent, forecast missing) with severity badges.
  - **Budget section:** initial budget, revisions table (date, amount, rationale, status, requested by, decided by). "Request revision" (PM/Admin) with amount, effective date, rationale. Approve/reject for eligible users with confirm + Idempotency-Key. Pending/rejected revisions shown but labelled "not included in approved budget".
  - **Costs section:** DataTable (date, category, description, amount, status, created by, posted by/at) with filters (status, category, date range) and server pagination. "Add cost" (draft) for authorized roles; **Post** with ConfirmDialog ("Posted costs can't be edited or deleted; corrections are made by reversal"); **Reverse** for posted costs with reason + confirm; drafts editable/deletable. Positive amount and required fields validated client-side and server-side.
  - **Forecast grid:** editable months after the reporting month up to project end, AED inputs, save all in one PUT; past months read-only; "No forecast" state explains that EAC = actual spend until a forecast exists.
  - **Charts:** spend by category (bar), monthly actual vs forecast (line; actual solid indigo, forecast dashed teal), using the fixed chart palette.
- **Cost categories** (Admin): list, create, rename/deactivate as the API allows.
- **Portfolio pages:** `/finance/alerts` (scoped alerts table, department filter, link to project finance tab); `/finance/comparison` (pick up to 10 projects → side-by-side table + budget vs actual vs EAC grouped bar; show the `excluded` list if the API drops projects).
- **Drill-down:** clicking the Actual spend card scrolls/filters the Costs table to posted costs ≤ as-of date — the transactions that make up the number (spec §4 financial insight).
- After post/reverse/revision decision/forecast save: invalidate the financial summary, costs list, alerts, comparison and dashboard keys. **Never** update the summary numbers locally.
- Contributor: finance tab is read-only (or hidden if the API forbids reading) — Add/Post buttons not rendered; a direct POST still returns 403 which the UI handles.

**Part B tests:** posting a cost shows the confirm dialog, sends Idempotency-Key, then refetches the summary (assert summary endpoint called again, value displayed from the second response); draft vs posted actions differ per row; reversal requires a reason; forecast grid disables past months; contributor sees no Post/Add buttons; utilization card renders "—" when the API returns null (zero budget).

---

## Acceptance (whole milestone)
```
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd backend && npm test
```
Manual click-through for the owner (list in the run report):
- **B:** PM posts a new cost → actual, remaining, utilization change → click Actual spend → the new transaction is in the drill-down.
- **C:** PM approves a contributor's CR → detail shows the decision and exactly one new history entry.
- **D (UI side):** as contributor, decision panel and Post button are absent; then call both endpoints with curl using the contributor cookie → 403 (backend proof, already tested).

## Out of scope
Executive dashboard, admin/audit screens, automation & notifications UI, E2E, Docker (M3).

## Design rationale
Why the score/band preview is display-only; how idempotency keys prevent double posting and double approval; why approved CRs never touch finance; why finance numbers are always refetched rather than recalculated; how a KPI traces back to its transactions.
