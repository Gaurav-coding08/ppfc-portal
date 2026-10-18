-- 003_governance: change requests, change history, audit events, idempotency keys

CREATE TABLE change_requests (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  project_id      BIGINT NOT NULL REFERENCES projects (id),
  title           TEXT NOT NULL,
  description     TEXT,
  impact_summary  TEXT,
  requested_by    BIGINT NOT NULL REFERENCES users (id),
  status          TEXT NOT NULL CHECK (status IN ('submitted', 'approved', 'rejected', 'returned')) DEFAULT 'submitted',
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by      BIGINT REFERENCES users (id),
  decided_at      TIMESTAMPTZ,
  decision_reason TEXT,
  version         INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Self-approval blocked at DB level as defence in depth
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);

CREATE TABLE change_history (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id BIGINT NOT NULL REFERENCES change_requests (id) ON DELETE CASCADE,
  from_status       TEXT,
  to_status         TEXT NOT NULL,
  actor_id          BIGINT NOT NULL REFERENCES users (id),
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    BIGINT REFERENCES users (id),
  entity_type TEXT NOT NULL,
  entity_id   BIGINT NOT NULL,
  action      TEXT NOT NULL,
  project_id  BIGINT,
  before      JSONB,
  after       JSONB,
  request_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  key             TEXT NOT NULL,
  user_id         BIGINT NOT NULL REFERENCES users (id),
  method          TEXT NOT NULL,
  path            TEXT NOT NULL,
  response_status INT NOT NULL,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key, user_id)
);
