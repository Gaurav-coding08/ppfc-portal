-- 006_indexes: FK and filter indexes for common query patterns

-- projects
CREATE INDEX idx_projects_department_id ON projects (department_id);
CREATE INDEX idx_projects_owner_id ON projects (owner_id);
CREATE INDEX idx_projects_status ON projects (status);

-- project_members
CREATE INDEX idx_project_members_user_id ON project_members (user_id);

-- tasks
CREATE INDEX idx_tasks_project_status ON tasks (project_id, status);
CREATE INDEX idx_tasks_assignee_id ON tasks (assignee_id);
CREATE INDEX idx_tasks_due_date ON tasks (due_date);

-- milestones
CREATE INDEX idx_milestones_project_due ON milestones (project_id, due_date);

-- risks
CREATE INDEX idx_risks_project_status ON risks (project_id, status);
CREATE INDEX idx_risks_score_open ON risks (score) WHERE status <> 'closed';

-- change_requests
CREATE INDEX idx_cr_project_status ON change_requests (project_id, status);

-- change_history
CREATE INDEX idx_ch_change_request_id ON change_history (change_request_id);

-- audit_events
CREATE INDEX idx_audit_entity ON audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_created_at ON audit_events (created_at DESC);

-- cost_transactions
CREATE INDEX idx_costs_project_status_date ON cost_transactions (project_id, status, txn_date);
CREATE INDEX idx_costs_category_id ON cost_transactions (category_id);

-- budget_revisions
CREATE INDEX idx_budrev_project_status ON budget_revisions (project_id, status);

-- financial_forecasts
CREATE INDEX idx_forecasts_project_month ON financial_forecasts (project_id, month);
