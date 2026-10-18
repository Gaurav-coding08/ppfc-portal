-- 005_automation: outbox, automation runs, notifications

CREATE TABLE outbox (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type  TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   BIGINT NOT NULL,
  event_date  DATE,
  payload     JSONB,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
  attempts    INT NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (event_type, entity_id, event_date)
);

CREATE TABLE automation_runs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name      TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')) DEFAULT 'running',
  items_found   INT,
  items_created INT,
  error         TEXT
);

CREATE TABLE notifications (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id),
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  outbox_id  BIGINT REFERENCES outbox (id),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
