-- 014_finance_views: convenience views for Power BI / Access parity.
-- Both use the default reporting date from app_settings so dashboards
-- see the same numbers without specifying a date.

-- Spend by category: posted costs grouped by category, reversals negative.
CREATE OR REPLACE VIEW v_spend_by_category AS
  SELECT
    ct.project_id,
    ct.category_id,
    cc.code  AS category_code,
    cc.name  AS category_name,
    SUM(
      CASE WHEN ct.entry_type = 'expense' THEN ct.amount ELSE -ct.amount END
    ) AS total_spend
  FROM cost_transactions ct
  JOIN cost_categories cc ON cc.id = ct.category_id
  WHERE ct.status = 'posted'
    AND ct.txn_date <= fn_reporting_date()
  GROUP BY ct.project_id, ct.category_id, cc.code, cc.name;

-- Monthly spend: posted costs grouped by month, reversals negative.
CREATE OR REPLACE VIEW v_monthly_spend AS
  SELECT
    ct.project_id,
    date_trunc('month', ct.txn_date)::date AS month,
    SUM(
      CASE WHEN ct.entry_type = 'expense' THEN ct.amount ELSE -ct.amount END
    ) AS actual_spend
  FROM cost_transactions ct
  WHERE ct.status = 'posted'
    AND ct.txn_date <= fn_reporting_date()
  GROUP BY ct.project_id, date_trunc('month', ct.txn_date);
