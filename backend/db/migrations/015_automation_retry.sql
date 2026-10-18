-- 015_automation_retry: supports the outbox dispatcher's retry/backoff
-- (feature 15) and defence-in-depth against duplicate notifications.

ALTER TABLE outbox ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- The dispatcher only ever selects pending rows whose backoff has elapsed;
-- partial on status='pending' keeps the index small as rows move to
-- sent/failed.
CREATE INDEX idx_outbox_pending_next_attempt ON outbox (status, next_attempt_at) WHERE status = 'pending';

-- The dispatcher already avoids re-notifying via ON CONFLICT DO NOTHING on
-- insert, but a unique constraint makes that a guarantee, not just a
-- convention the insert happens to follow.
ALTER TABLE notifications ADD CONSTRAINT uq_notifications_outbox_user UNIQUE (outbox_id, user_id);
