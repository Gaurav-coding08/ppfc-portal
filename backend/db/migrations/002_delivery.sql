-- 002_delivery: projects, members, tasks, milestones, risks, progress snapshots

CREATE TABLE projects (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  department_id BIGINT NOT NULL REFERENCES departments (id),
  owner_id      BIGINT NOT NULL REFERENCES users (id),
  status        TEXT NOT NULL CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  version       INT NOT NULL DEFAULT 1,
  created_by    BIGINT REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE project_members (
  project_id  BIGINT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users (id),
  member_role TEXT NOT NULL CHECK (member_role IN ('manager', 'contributor')),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE tasks (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects (id),
  title        TEXT NOT NULL,
  description  TEXT,
  assignee_id  BIGINT REFERENCES users (id),
  status       TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')) DEFAULT 'todo',
  priority     TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  start_date   DATE,
  due_date     DATE NOT NULL,
  weight       NUMERIC(6,2) NOT NULL CHECK (weight > 0),
  progress     INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  completed_at TIMESTAMPTZ,
  version      INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A done task must have progress = 100
  CHECK (status <> 'done' OR progress = 100)
);

CREATE TABLE milestones (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id    BIGINT NOT NULL REFERENCES projects (id),
  name          TEXT NOT NULL,
  due_date      DATE NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('planned', 'achieved', 'missed')) DEFAULT 'planned',
  achieved_date DATE,
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An achieved milestone must have an achieved_date
  CHECK (status <> 'achieved' OR achieved_date IS NOT NULL)
);

CREATE TABLE risks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  BIGINT NOT NULL REFERENCES projects (id),
  type        TEXT NOT NULL CHECK (type IN ('risk', 'issue')),
  title       TEXT NOT NULL,
  description TEXT,
  owner_id    BIGINT REFERENCES users (id),
  probability SMALLINT NOT NULL CHECK (probability >= 1 AND probability <= 5),
  impact      SMALLINT NOT NULL CHECK (impact >= 1 AND impact <= 5),
  score       SMALLINT GENERATED ALWAYS AS (probability * impact) STORED,
  mitigation  TEXT,
  due_date    DATE,
  status      TEXT NOT NULL CHECK (status IN ('open', 'mitigating', 'closed')) DEFAULT 'open',
  closed_at   TIMESTAMPTZ,
  version     INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE progress_snapshots (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id    BIGINT NOT NULL REFERENCES projects (id),
  snapshot_date DATE NOT NULL,
  progress_pct  NUMERIC(5,2),
  actual_spend  NUMERIC(14,2),
  UNIQUE (project_id, snapshot_date)
);
