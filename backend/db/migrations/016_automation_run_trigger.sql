-- 016_automation_run_trigger: records whether an automation run was started
-- by the worker's schedule or manually (admin "Run now" or the
-- `npm run automation:run` CLI), so the admin runs table can show it.
-- Existing and seeded rows predate the column and were all scheduled
-- passes, hence the default.

ALTER TABLE automation_runs
  ADD COLUMN trigger TEXT NOT NULL DEFAULT 'schedule'
  CHECK (trigger IN ('schedule', 'manual'));
