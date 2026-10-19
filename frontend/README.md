# PPFC Portal — frontend

React + Vite SPA for the PPFC Portal. See the repo root [README.md](../README.md) for how to
run this alongside the backend, and [CLAUDE.md](../CLAUDE.md) for the frontend stack,
structure and design-system conventions this app follows.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173, proxies /api to :4000
npm run build        # Type-check (tsc -b) + production build
npm run preview      # Preview the production build locally
npm run typecheck    # tsc -b --noEmit
npm run lint         # ESLint
npm run format       # Prettier --write
npm test             # Vitest (jsdom + msw)
npm run test:watch   # Vitest in watch mode
npm run api:types    # Regenerate src/api/schema.ts from ../docs/openapi.yaml
```

Gate before calling a feature done: `npm run typecheck && npm run lint && npm test && npm run build`.
