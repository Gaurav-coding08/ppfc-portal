-- 010: Allow response_status to be NULL so the idempotency middleware can
-- reserve a key (INSERT with NULL status) before running the handler,
-- closing the race window where two concurrent requests both pass the
-- SELECT check and both execute the handler.
ALTER TABLE idempotency_keys ALTER COLUMN response_status DROP NOT NULL;
