-- 004_finance: cost categories, budgets, revisions, cost transactions, forecasts

CREATE TABLE cost_categories (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code      TEXT UNIQUE NOT NULL,
  name      TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE project_budgets (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id     BIGINT NOT NULL UNIQUE REFERENCES projects (id),
  initial_amount NUMERIC(14,2) NOT NULL CHECK (initial_amount >= 0),
  currency       CHAR(3) NOT NULL DEFAULT 'AED',
  approved_by    BIGINT REFERENCES users (id),
  approved_at    TIMESTAMPTZ
);

CREATE TABLE budget_revisions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES projects (id),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
  rationale       TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  requested_by    BIGINT NOT NULL REFERENCES users (id),
  decided_by      BIGINT REFERENCES users (id),
  decided_at      TIMESTAMPTZ,
  decision_reason TEXT,
  effective_date  DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Self-approval blocked at DB level
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);

CREATE TABLE cost_transactions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  BIGINT NOT NULL REFERENCES projects (id),
  category_id BIGINT NOT NULL REFERENCES cost_categories (id),
  txn_date    DATE NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  vendor      TEXT,
  status      TEXT NOT NULL CHECK (status IN ('draft', 'posted')) DEFAULT 'draft',
  entry_type  TEXT NOT NULL CHECK (entry_type IN ('expense', 'reversal')) DEFAULT 'expense',
  reverses_id BIGINT UNIQUE REFERENCES cost_transactions (id),
  created_by  BIGINT NOT NULL REFERENCES users (id),
  posted_by   BIGINT REFERENCES users (id),
  posted_at   TIMESTAMPTZ,
  version     INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Posted costs must have posted_by and posted_at
  CHECK (status <> 'posted' OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)),
  -- reversal ↔ reverses_id must be consistent
  CHECK ((entry_type = 'reversal') = (reverses_id IS NOT NULL))
);

CREATE TABLE financial_forecasts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects (id),
  month      DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  amount     NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  updated_by BIGINT REFERENCES users (id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, month)
);

-- DB-level guard: posted cost transactions are immutable.
-- Corrections happen via a separate reversal entry, never by editing.
CREATE OR REPLACE FUNCTION prevent_posted_cost_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted cost transactions are immutable — use a reversal entry'
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_posted_cost_mutation
  BEFORE UPDATE OR DELETE ON cost_transactions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_cost_mutation();
