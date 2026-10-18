-- 001_core: app settings, departments, users

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_settings (key, value) VALUES ('reporting_date', '2026-09-30');

CREATE TABLE departments (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('contributor', 'project_manager', 'admin')),
  department_id BIGINT REFERENCES departments (id),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique email
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
