# API routes

Base path: `/api/v1`. See `CLAUDE.md` for response shape, status code and error code conventions.

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/health | public | Liveness check; also pings the DB with `SELECT 1`. |
