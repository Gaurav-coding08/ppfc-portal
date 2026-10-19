import createClient from 'openapi-fetch';
import { queryClient } from '@/app/queryClient';
import type { paths } from './schema';

// `credentials: 'include'` is required on every request so the httpOnly
// `ppfc_token` cookie the backend sets on login is sent back — CLAUDE.md
// "Auth: httpOnly cookie set by the backend. Every request uses
// `credentials: 'include'`." The Vite dev proxy (vite.config.ts) makes the
// browser see `/api` as same-origin, so there's no CORS to configure here.
//
// A relative baseUrl only works in a real browser, where `fetch` resolves it
// against `window.location`. Vitest's jsdom environment supplies Node's
// `fetch` (undici), which has no such notion and throws on a relative URL —
// so tests need an absolute origin. `import.meta.env.VITEST` is set by
// Vitest itself, never in a real build.
const baseUrl = import.meta.env.VITEST ? 'http://localhost/api/v1' : '/api/v1';

export const api = createClient<paths>({
  baseUrl,
  credentials: 'include',
  // openapi-fetch defaults to `globalThis.fetch` captured once, by value, at
  // client-creation time. In tests that's whatever `fetch` existed at module
  // import time — possibly *before* msw's `server.listen()` has patched it,
  // depending on import order, which would silently bypass every mock. This
  // wrapper looks up `globalThis.fetch` fresh on every call instead, so it
  // always goes through whatever is currently installed.
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
});

// CLAUDE.md "A 401 anywhere → clear the query cache and redirect to
// /login?next=...". `/auth/me` and `/auth/login` are excluded: a 401 from
// `/auth/me` just means "not logged in yet" (the normal state on first
// load), and a 401 from `/auth/login` is a bad-credentials message the
// login form displays inline — neither is a "session expired mid-use"
// event. A full `window.location` navigation (not react-router) is used
// deliberately: it also discards any other in-memory state left over from
// the now-invalid session.
api.use({
  onResponse({ request, response }) {
    const isAuthCheck = request.url.includes('/auth/me') || request.url.includes('/auth/login');
    const alreadyOnLogin = window.location.pathname === '/login';
    if (response.status === 401 && !isAuthCheck && !alreadyOnLogin) {
      queryClient.clear();
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?next=${next}`);
    }
    return response;
  },
});

// Consequential POSTs (cost post, CR decision, revision decision, forecast
// save — CLAUDE.md "Double submit") attach this header so a retried request
// with the same key replays the original response instead of double-acting.
// Usage: api.POST('/tasks/{id}', { ...  headers: idempotencyHeaders(key) })
export function idempotencyHeaders(key: string): Record<string, string> {
  return { 'Idempotency-Key': key };
}
