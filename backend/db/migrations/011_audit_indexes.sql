-- 011_audit_indexes: supports admin audit-log and project-activity filtering
-- (feature 06), which filters by actor and by project in addition to the
-- entity/created_at indexes migration 006 already added.

CREATE INDEX idx_audit_actor_id ON audit_events (actor_id);
CREATE INDEX idx_audit_project_id ON audit_events (project_id);
