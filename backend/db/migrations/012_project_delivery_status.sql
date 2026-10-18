-- 012_project_delivery_status: single source of truth for the delivery-status
-- badge shown on the project list/detail (feature 07).
--
-- Rule (CLAUDE.md-style: one SQL definition, CTE-per-fact to avoid fan-out):
--   completed  if the project's own status is 'completed'
--   at_risk    if any overdue incomplete task, OR a missed milestone,
--              OR an open risk/issue with score >= 15
--   behind     if elapsed-time% minus progress% > 15 points
--   on_track   otherwise
--
-- A milestone counts as "missed" either because its status is already
-- 'missed', or because it's still 'planned' but its due date has passed
-- asOf — the seed generator and any future milestone feature only ever set
-- 'planned'/'achieved' directly, so "missed" has to be derived here too.
CREATE OR REPLACE FUNCTION fn_project_delivery_status(p_as_of DATE)
RETURNS TABLE (
  project_id      BIGINT,
  delivery_status TEXT
)
LANGUAGE sql STABLE
AS $$
  WITH overdue_tasks AS (
    SELECT DISTINCT project_id
    FROM tasks
    WHERE status <> 'done' AND due_date < p_as_of
  ),
  missed_milestones AS (
    SELECT DISTINCT project_id
    FROM milestones
    WHERE status = 'missed' OR (status = 'planned' AND due_date < p_as_of)
  ),
  high_risks AS (
    SELECT DISTINCT project_id
    FROM risks
    WHERE status <> 'closed' AND score >= 15
  ),
  progress AS (
    SELECT project_id, progress_pct FROM fn_project_progress()
  )
  SELECT
    p.id AS project_id,
    CASE
      WHEN p.status = 'completed' THEN 'completed'
      WHEN ot.project_id IS NOT NULL OR mm.project_id IS NOT NULL OR hr.project_id IS NOT NULL
        THEN 'at_risk'
      -- elapsed% = how far through the schedule asOf falls, clamped to [0, 100]
      -- so a not-yet-started or already-ended project can't push it outside that range.
      WHEN (
        LEAST(100, GREATEST(0,
          100.0 * (p_as_of - p.start_date) / NULLIF(p.end_date - p.start_date, 0)
        )) - COALESCE(pr.progress_pct, 0)
      ) > 15 THEN 'behind'
      ELSE 'on_track'
    END AS delivery_status
  FROM projects p
  LEFT JOIN overdue_tasks     ot ON ot.project_id = p.id
  LEFT JOIN missed_milestones mm ON mm.project_id = p.id
  LEFT JOIN high_risks        hr ON hr.project_id = p.id
  LEFT JOIN progress          pr ON pr.project_id = p.id;
$$;
