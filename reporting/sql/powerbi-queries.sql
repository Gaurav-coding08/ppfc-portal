-- =====================================================================
-- Power BI reporting queries (PostgreSQL, database: ppfc)
-- Reporting snapshot: fn_reporting_date() = 2026-09-30
-- Run as the read-only role ppfc_reader. Each query is self-contained.
-- =====================================================================

-- Q1. Overdue incomplete tasks as of the reporting date
-- Rule: due_date < cutoff AND status <> 'done'.
-- A task due exactly ON the cutoff is not overdue (strict "<").
-- LEFT JOIN users so the unassigned task is not dropped.
SELECT p.code                              AS project,
       t.id,
       t.title,
       u.full_name                         AS assignee,
       t.due_date,
       t.status,
       t.progress,
       fn_reporting_date() - t.due_date    AS days_overdue
FROM tasks t
JOIN projects p    ON p.id = t.project_id
LEFT JOIN users u  ON u.id = t.assignee_id
WHERE t.due_date < fn_reporting_date()
  AND t.status <> 'done'
ORDER BY days_overdue DESC;


-- Q2. Project financial performance
-- Uses the single finance definition fn_project_financials(asOf).
-- Inside it, budget, actuals and forecasts are aggregated in SEPARATE CTEs
-- and then joined per project, so cost rows never multiply forecast rows.
--   current_budget = initial + approved revisions (effective <= asOf)
--   actual_spend   = posted costs with txn_date <= asOf, reversals negative
--   eac            = actual_spend + forecasts for months after the asOf month
SELECT p.code,
       p.name,
       d.name                                 AS department,
       f.current_budget,
       f.actual_spend,
       f.remaining_budget,
       round(f.utilization * 100, 1)          AS utilization_pct,
       f.forecast_to_complete,
       f.eac,
       f.projected_variance,
       f.is_overrun,
       f.forecast_missing
FROM fn_project_financials(fn_reporting_date()) f
JOIN projects p    ON p.id = f.project_id
JOIN departments d ON d.id = p.department_id
ORDER BY f.projected_variance;


-- Q3. Open high-exposure risks
-- score = probability x impact (generated column). High exposure = score >= 15.
-- Closed risks are excluded by status, so the seeded closed score-25 risk never appears.
SELECT p.code       AS project,
       r.id,
       r.type,
       r.title,
       r.probability,
       r.impact,
       r.score,
       r.status,
       r.mitigation,
       r.due_date
FROM risks r
JOIN projects p ON p.id = r.project_id
WHERE r.status <> 'closed'
  AND r.score >= 15
ORDER BY r.score DESC, r.due_date;


-- Q4. Monthly actual spend vs forecast
-- Each side is aggregated to month level FIRST, then joined on month,
-- so cost rows and forecast rows never multiply each other (no fan-out).
-- Reversals reduce spend, matching fn_project_financials.
WITH actuals AS (
    SELECT date_trunc('month', txn_date)::date AS month,
           sum(CASE WHEN entry_type = 'reversal' THEN -amount ELSE amount END) AS actual
    FROM cost_transactions
    WHERE status = 'posted'
      AND txn_date <= fn_reporting_date()
    GROUP BY 1
),
fc AS (
    SELECT month, sum(amount) AS forecast
    FROM financial_forecasts
    GROUP BY 1
)
SELECT coalesce(a.month, f.month)  AS month,
       coalesce(a.actual, 0)       AS actual,
       coalesce(f.forecast, 0)     AS forecast
FROM actuals a
FULL OUTER JOIN fc f ON f.month = a.month
ORDER BY month;


-- Q5. KPI reconciliation (compare with the web dashboard as Admin and with Power BI)
-- Each KPI is its own subquery, so no join can inflate another.
SELECT
  (SELECT sum(current_budget) FROM v_project_financials)                                   AS approved_budget,
  (SELECT sum(actual_spend)   FROM v_project_financials)                                   AS actual_spend,
  (SELECT sum(eac)            FROM v_project_financials)                                   AS eac,
  (SELECT count(*) FROM tasks WHERE due_date < fn_reporting_date() AND status <> 'done')   AS overdue_tasks,
  (SELECT count(*) FROM risks WHERE status <> 'closed' AND score >= 15)                    AS open_high_risks;
