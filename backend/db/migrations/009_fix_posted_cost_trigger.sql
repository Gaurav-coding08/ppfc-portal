-- 009_fix_posted_cost_trigger: RETURN OLD for DELETE so draft costs can be
-- deleted. The original RETURN NEW is NULL for DELETE triggers, which would
-- silently cancel all deletes including drafts.

CREATE OR REPLACE FUNCTION prevent_posted_cost_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted cost transactions are immutable — use a reversal entry'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
