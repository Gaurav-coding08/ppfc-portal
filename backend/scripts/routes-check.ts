#!/usr/bin/env tsx
// Compares the route inventory in docs/api-routes.md against the
// master list in tests/integration/route-guard.test.ts. Exits 0
// when they match; exits 1 with a diff when they diverge.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

// Parse api-routes.md: extract "| METHOD | /api/v1/... |" rows
function parseDocRoutes(): Set<string> {
  const md = fs.readFileSync(path.join(ROOT, 'docs/api-routes.md'), 'utf8');
  const routes = new Set<string>();
  for (const line of md.split('\n')) {
    const match = line.match(/^\|\s*(GET|POST|PATCH|PUT|DELETE)\s*\|\s*(\/api\/v1\/[^\s|]+)/);
    if (match) {
      // Normalize: strip param names to a canonical form
      const method = match[1]!;
      const rawPath = match[2]!.replace(/\s+$/, '');
      routes.add(`${method} ${normalizePath(rawPath)}`);
    }
  }
  return routes;
}

// Parse route-guard.test.ts: extract route entries from the ALL_ROUTES array
function parseTestRoutes(): Set<string> {
  const src = fs.readFileSync(
    path.join(ROOT, 'backend/tests/integration/route-guard.test.ts'),
    'utf8',
  );
  const routes = new Set<string>();
  // Match lines like: { method: 'GET', path: '/api/v1/health', public: true },
  const re = /method:\s*'(\w+)',\s*path:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    routes.add(`${m[1]} ${normalizePath(m[2]!)}`);
  }
  return routes;
}

// Normalize paths: convert both doc and test paths to a canonical
// form using :id everywhere (not :projectId) so they can be compared.
function normalizePath(p: string): string {
  return p
    // Normalize doc params: :projectId → :id where it's the first param after /projects/
    .replace(/:projectId\b/g, ':id')
    // For test paths: replace literal IDs
    .replace(/\/(\d+)\/members\/(\d+)/, '/:id/members/:userId')
    .replace(/\/(\d+)\/(decision|resubmit|post|reverse)/, '/:id/$2')
    .replace(/\/(\d+)/g, '/:id');
}

const docRoutes = parseDocRoutes();
const testRoutes = parseTestRoutes();

const inDocNotTest = [...docRoutes].filter((r) => !testRoutes.has(r)).sort();
const inTestNotDoc = [...testRoutes].filter((r) => !docRoutes.has(r)).sort();

if (inDocNotTest.length === 0 && inTestNotDoc.length === 0) {
  console.log(`✓ routes match: ${docRoutes.size} routes in docs, ${testRoutes.size} in tests`);
  process.exit(0);
} else {
  if (inDocNotTest.length > 0) {
    console.error('Routes in docs/api-routes.md but NOT in route-guard test:');
    inDocNotTest.forEach((r) => console.error(`  + ${r}`));
  }
  if (inTestNotDoc.length > 0) {
    console.error('Routes in route-guard test but NOT in docs/api-routes.md:');
    inTestNotDoc.forEach((r) => console.error(`  - ${r}`));
  }
  process.exit(1);
}
