# KPI reconciliation: SQL vs web dashboard vs Power BI

**Snapshot:** 30 Sep 2026 (`fn_reporting_date()`).
**Web dashboard:** checked as **Admin**; other roles see a scope-filtered view.
**SQL:** queries in `reporting/sql/powerbi-queries.sql`, run in DBeaver.
**Power BI:** `reporting/powerbi/ppfc-portfolio.pbix`.

All three read the same snapshot date and the same finance definition (`fn_project_financials`):
- approved budget = initial budget + approved revisions only;
- actual spend = posted costs up to the cutoff, with reversals subtracted;
- EAC = actual spend + forecasts for months after the cutoff month.

## Scope 1: whole portfolio (no filters)

| KPI | SQL (exact) | Web dashboard | Power BI | Match |
|---|---|---|---|---|
| Approved budget | AED 896,000.00 | AED 896K | AED 896K | Yes |
| Actual spend | AED 580,390.00 | AED 580.4K | AED 580.4K | Yes |
| Remaining budget | AED 315,610.00 | AED 315.6K | AED 315.6K | Yes |
| Budget utilization | 64.78% | 64.8% | 64.8% | Yes |
| Forecast EAC | AED 769,390.00 | AED 769.4K | AED 769.4K | Yes |
| Projects forecast over budget | 4 | 4 | 4 | Yes |
| Projected overrun | AED 92,260.00 | AED 92.3K | AED 92.26K | Yes |
| Overdue incomplete tasks | 42 | 42 | 42 | Yes |
| Open high-exposure risks | 1 | 1 | 1 | Yes |

## Scope 2: department = Digital Platforms

| KPI | SQL (exact) | Web dashboard | Power BI | Match |
|---|---|---|---|---|
| Approved budget | AED 375,000.00 | AED 375K | AED 375K | Yes |
| Actual spend | AED 155,130.00 | AED 155.1K | AED 155.1K | Yes |
| Remaining budget | AED 219,870.00 | AED 219.9K | AED 219.9K | Yes |
| Budget utilization | 41.37% | 41.4% | 41.4% | Yes |
| Forecast EAC | AED 278,130.00 | AED 278.1K | AED 278.1K | Yes |
| Projects forecast over budget | 2 | 2 | 2 | Yes |
| Projected overrun | AED 48,130.00 | AED 48.1K | AED 48.13K | Yes |
| Overdue incomplete tasks | 9 | 9 | 9 | Yes |
| Open high-exposure risks | 0 | 0 | 0 | Yes |

## Notes

- **Display rounding.** Cards in both tools show amounts in thousands with one decimal (for example AED 580.4K). The exact figures are the SQL column, and the underlying values are identical. Hovering over a Power BI card shows the full value.

**Result:** all nine KPIs agree across SQL, the web dashboard and Power BI at both scopes.
