-- 008_reader_grants: read-only access for the ppfc_reader reporting role.
-- Guarded so the migration doesn't fail if the role was not created
-- (e.g. a fresh dev setup without the init.sql having run).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ppfc_reader') THEN
    EXECUTE 'GRANT CONNECT ON DATABASE ' || current_database() || ' TO ppfc_reader';
    GRANT USAGE ON SCHEMA public TO ppfc_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO ppfc_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ppfc_reader;
  END IF;
END
$$;
