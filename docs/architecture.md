# Architecture

## Layers

```
HTTP request
   │
   ▼
routes          (URL + middleware wiring: authenticate, validate, idempotency)
   │
   ▼
controller      (parse validated input, call service, shape HTTP response — no SQL, no business rules)
   │
   ▼
service         (business rules, authorization checks on loaded resources, transactions, audit writes)
   │
   ▼
repository      (the only place SQL lives — parameterized, accepts an optional client for transactions)
   │
   ▼
PostgreSQL
```

Cross-cutting pieces that every layer can reach: `config/env.ts` (validated env), `lib/logger.ts`
(pino), `lib/errors.ts` (`AppError` + helpers), `middleware/errorHandler.ts` (maps any thrown
error to the standard `{ error: { code, message, details?, requestId } }` body), `db/pool.ts`
(single `pg.Pool`) and `db/tx.ts` (`withTx` for atomic mutation + audit).

See `CLAUDE.md` for the full repo layout, API conventions, roles/authorization model and
financial definitions. This file stays a short map of *why* the layers are shaped this way;
details live in each feature's context file under `.claude/context/`.
