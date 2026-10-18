-- 007_financial_functions: single source of truth for every finance KPI.
-- Web dashboard, API and Power BI all read from these same definitions.

-- Returns the system reporting date from app_settings.
CREATE OR REPLACE FUNCTION fn_reporting_date()
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT value::date FROM app_settings WHERE key = 'reporting_date';
$$;

-- Returns one row per project with all financial KPIs computed as of p_as_of.
-- Each fact (budget, actuals, forecasts) is aggregated in its own CTE first,
-- then joined to projects — this prevents the fan-out that would happen if
-- tasks/costs/forecasts were joined directly in one query.
CREATE OR REPLACE FUNCTION fn_project_financials(p_as_of DATE)
RETURNS TABLE (
  project_id         BIGINT,
  initial_budget     NUMERIC(14,2),
  approved_revisions NUMERIC(14,2),
  current_budget     NUMERIC(14,2),
  actual_spend       NUMERIC(14,2),
  remaining_budget   NUMERIC(14,2),
  utilization        NUMERIC(7,4),
  forecast_to_complete NUMERIC(14,2),
  eac                NUMERIC(14,2),
  projected_variance NUMERIC(14,2),
  forecast_missing   BOOLEAN,
  is_overrun         BOOLEAN,
  is_near_budget     BOOLEAN
)
LANGUAGE sql STABLE
AS $$
  WITH budget AS (
    -- Initial budget + sum of approved revisions with effective_date on or before asOf
    SELECT
      pb.project_id,
      pb.initial_amount,
      COALESCE(SUM(br.amount) FILTER (
        WHERE br.status = 'approved' AND br.effective_date <= p_as_of
      ), 0) AS approved_rev
    FROM project_budgets pb
    LEFT JOIN budget_revisions br ON br.project_id = pb.project_id
    GROUP BY pb.project_id, pb.initial_amount
  ),
  actuals AS (
    -- Sum of posted cost transactions on or before asOf.
    -- Reversals subtract (entry_type = 'reversal' flips the sign).
    SELECT
      ct.project_id,
      COALESCE(SUM(
        CASE WHEN ct.entry_type = 'expense' THEN ct.amount
             ELSE -ct.amount
        END
      ), 0) AS spend
    FROM cost_transactions ct
    WHERE ct.status = 'posted' AND ct.txn_date <= p_as_of
    GROUP BY ct.project_id
  ),
  ftc AS (
    -- Forecast-to-complete: forecasts for months strictly after the asOf month
    SELECT
      ff.project_id,
      SUM(ff.amount) AS forecast_amount,
      TRUE AS has_forecasts
    FROM financial_forecasts ff
    WHERE ff.month > date_trunc('month', p_as_of)::date
    GROUP BY ff.project_id
  )
  SELECT
    p.id AS project_id,
    COALESCE(b.initial_amount, 0)                                    AS initial_budget,
    COALESCE(b.approved_rev, 0)                                      AS approved_revisions,
    COALESCE(b.initial_amount, 0) + COALESCE(b.approved_rev, 0)      AS current_budget,
    COALESCE(a.spend, 0)                                             AS actual_spend,
    (COALESCE(b.initial_amount, 0) + COALESCE(b.approved_rev, 0))
      - COALESCE(a.spend, 0)                                         AS remaining_budget,
    -- utilization = actual / current_budget; null when budget is zero
    COALESCE(a.spend, 0)
      / NULLIF(COALESCE(b.initial_amount, 0) + COALESCE(b.approved_rev, 0), 0)
                                                                     AS utilization,
    COALESCE(f.forecast_amount, 0)                                   AS forecast_to_complete,
    COALESCE(a.spend, 0) + COALESCE(f.forecast_amount, 0)            AS eac,
    (COALESCE(b.initial_amount, 0) + COALESCE(b.approved_rev, 0))
      - (COALESCE(a.spend, 0) + COALESCE(f.forecast_amount, 0))      AS projected_variance,
    -- forecast_missing: true when no forecast rows exist at all for this project
    NOT COALESCE(f.has_forecasts, FALSE)                              AS forecast_missing,
    -- is_overrun: EAC exceeds current budget
    (COALESCE(a.spend, 0) + COALESCE(f.forecast_amount, 0))
      > (COALESCE(b.initial_amount, 0) + COALESCE(b.approved_rev, 0)) AS is_overrun,
    -- is_near_budget: utilization >= 90% and not already overrun
    (COALESCE(a.spend, 0)
      / NULLIF(COALESCE(b.initial_amount, 0) + COALESCE(b.approved_rev, 0), 0) >= 0.9)
    AND NOT (
      (COALESCE(a.spend, 0) + COALESCE(f.forecast_amount, 0))
        > (COALESCE(b.initial_amount, 0) + COALESCE(b.approved_rev, 0))
    )                                                                AS is_near_budget
  FROM projects p
  LEFT JOIN budget  b ON b.project_id = p.id
  LEFT JOIN actuals a ON a.project_id = p.id
  LEFT JOIN ftc     f ON f.project_id = p.id;
$$;

-- Weighted progress per project: sum(weight * progress) / sum(weight).
-- Returns 0 when a project has no tasks.
CREATE OR REPLACE FUNCTION fn_project_progress()
RETURNS TABLE (
  project_id   BIGINT,
  progress_pct NUMERIC(5,2),
  task_count   INT,
  done_count   INT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id AS project_id,
    COALESCE(
      SUM(t.weight * t.progress) / NULLIF(SUM(t.weight), 0),
      0
    )::NUMERIC(5,2) AS progress_pct,
    COUNT(t.id)::INT AS task_count,
    COUNT(t.id) FILTER (WHERE t.status = 'done')::INT AS done_count
  FROM projects p
  LEFT JOIN tasks t ON t.project_id = p.id
  GROUP BY p.id;
$$;

-- Convenience views for Power BI / Access — always use the default reporting date
CREATE OR REPLACE VIEW v_project_financials AS
  SELECT * FROM fn_project_financials(fn_reporting_date());

CREATE OR REPLACE VIEW v_project_progress AS
  SELECT * FROM fn_project_progress();
