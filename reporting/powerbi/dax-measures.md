# Power BI DAX measures

All measures live in the `_Measures` table. The reporting date comes from the database (`fn_reporting_date()`), loaded as the `Reporting` query, so Power BI uses the same 30 Sep 2026 snapshot as the API and SQL.

| Measure | DAX | Meaning |
|---|---|---|
| Reporting Date | `MAX(Reporting[reporting_date])` | Snapshot date from the database |
| Approved Budget | `SUM(projects[current_budget])` | Initial budget + approved revisions only |
| Actual Spend | see below | Posted costs up to the cutoff, reversals subtracted |
| Remaining Budget | `[Approved Budget] - [Actual Spend]` | |
| Budget Utilization % | `DIVIDE([Actual Spend], [Approved Budget])` | Blank (not an error) for a zero budget |
| Forecast To Complete | see below | Forecasts for months after the cutoff month |
| EAC | `[Actual Spend] + [Forecast To Complete]` | Estimate at completion |
| Projected Variance | `[Approved Budget] - [EAC]` | Negative = forecast overrun |
| Overrun Projects | `COUNTROWS(FILTER(VALUES(projects[id]), [EAC] > [Approved Budget]))` | Projects whose EAC exceeds budget |
| Overdue Tasks | see below | Due before the cutoff and not done |
| Task Progress % | `DIVIDE(SUMX(tasks, tasks[weight] * tasks[progress]), SUM(tasks[weight])) / 100` | Weighted progress |
| Open High-Exposure Risks | `CALCULATE(COUNTROWS(risks), risks[status] <> "closed", risks[score] >= 15)` | |

```DAX
Actual Spend =
VAR Cutoff = [Reporting Date]
RETURN
CALCULATE(
    SUMX(cost_transactions,
        IF(cost_transactions[entry_type] = "reversal",
           -cost_transactions[amount],
            cost_transactions[amount])),
    cost_transactions[status] = "posted",
    cost_transactions[txn_date] <= Cutoff
)

Forecast To Complete =
VAR CutoffMonth = DATE(YEAR([Reporting Date]), MONTH([Reporting Date]), 1)
RETURN CALCULATE(SUM(financial_forecasts[amount]), financial_forecasts[month] > CutoffMonth)

Overdue Tasks =
VAR Cutoff = [Reporting Date]
RETURN CALCULATE(COUNTROWS(tasks), tasks[due_date] < Cutoff, tasks[status] <> "done")
```

## Model

- Import mode, connected to PostgreSQL as the read-only `ppfc_reader` role. `password_hash` is removed in Power Query.
- `v_project_financials` and `v_project_progress` are merged into `projects` (1:1), and their own load is disabled.
- `Calendar` table (2025–2027), marked as the date table, related to `cost_transactions[txn_date]` and `financial_forecasts[month]`.
- 10 relationships, all many-to-one with single direction (dimension → fact). Facts never relate to each other, so a filter can't fan out across tasks, risks and costs.
- Deliberately not related: `tasks[assignee_id]` → `users` (a second path from users would make filters ambiguous), and `project_members`.
