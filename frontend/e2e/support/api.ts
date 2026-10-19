import { expect, request, type APIRequestContext } from '@playwright/test';
import { storageStatePath, type Role } from './accounts.ts';

// Direct API access as one of the seeded roles, for *setup and cross-checks
// only* (e.g. "add a member so the task can be assigned", "the drawer count
// equals the drill endpoint's total"). The behaviour under test always goes
// through the UI. Uses the same saved session cookie as the browser.
export async function apiAs(role: Role, baseURL: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, storageState: storageStatePath(role) });
}

// Reads `{ data }` from a 2xx JSON response, failing the test with the body
// otherwise so a setup failure is easy to diagnose.
export async function dataOf<T>(responsePromise: ReturnType<APIRequestContext['get']>): Promise<T> {
  const response = await responsePromise;
  const body = await response.text();
  expect(response.ok(), `${response.status()} ${response.url()}\n${body}`).toBe(true);
  return (JSON.parse(body) as { data: T }).data;
}

export interface CreatedProject {
  id: number;
  code: string;
}

// A fresh project owned by the PM: no costs and no tasks, so a journey can
// assert exact before/after values without depending on earlier runs.
export async function createProjectAsPm(
  api: APIRequestContext,
  { name, ownerId, departmentId }: { name: string; ownerId: number; departmentId: number },
): Promise<CreatedProject> {
  return dataOf<CreatedProject>(
    api.post('/api/v1/projects', {
      data: {
        name,
        departmentId,
        ownerId,
        status: 'active',
        startDate: '2026-01-01',
        endDate: '2027-06-30',
        initialBudget: 100000,
      },
    }),
  );
}
