import type { Express } from 'express';

export interface RouteEntry {
  method: string;
  path: string;
}

// Walks the Express 4 router stack and returns every registered route.
// Express 4 stores mount paths as regexp objects on each layer; the
// `fast_slash` flag marks the root mount, and `fast_star` marks a
// wildcard. For literal paths, the regexp source follows the pattern
// `^\\/segment\\/segment(?:\\/(?=...))?$`.

// Express 4 internal layer shape — not exported by @types/express.
interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
  name: string;
  handle?: { stack?: RouterLayer[] };
  regexp?: RegExp & { fast_slash?: boolean };
}

export function extractRoutes(app: Express): RouteEntry[] {
  const routes: RouteEntry[] = [];

  function walk(stack: RouterLayer[], prefix: string): void {
    for (const layer of stack) {
      if (layer.route) {
        const routePath = prefix + layer.route.path;
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method: method.toUpperCase(), path: routePath });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const mountPath = getMountPath(layer);
        walk(layer.handle.stack, prefix + mountPath);
      }
    }
  }

  function getMountPath(layer: RouterLayer): string {
    if (layer.regexp?.fast_slash) return '';

    const src: string | undefined = layer.regexp?.source;
    if (!src) return '';

    // Express 4's actual mount regexp for a literal prefix (confirmed by
    // inspecting layer.regexp.source directly, not the shape this helper
    // originally assumed) is e.g. `^\/api\/v1\/projects\/?(?=\/|$)` — a bare
    // `\/?(?=\/|$)` trailing lookahead, with no `(?:` wrapper around it. The
    // previous regex here looked for that wrapper and never matched, so the
    // lookahead fragment leaked into every extracted path.
    let path = src
      .replace(/^\^/, '')
      .replace(/\\\/\?\(\?=.*$/, '')
      .replace(/\/\?\$?$/, '')
      .replace(/\$$/, '')
      .replace(/\\\//g, '/')
      .replace(/\\(.)/g, '$1');

    path = path.replace(/\?$/, '');

    return path;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = (app as any)._router as { stack?: RouterLayer[] } | undefined;
  if (router?.stack) {
    walk(router.stack, '');
  }

  return routes;
}
