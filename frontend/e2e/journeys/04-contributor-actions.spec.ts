import { expect, test } from '@playwright/test';
import { runTag, SEED, storageStatePath } from '../support/accounts.ts';
import { apiAs, dataOf } from '../support/api.ts';

test.use({ storageState: storageStatePath('contributor') });

// UI side of acceptance test D: a contributor sees no Post / Decide actions.
// The backend's 403 is the real rule (backend tests cover it); this proves
// the UI doesn't offer the actions in the first place.
test('contributor sees no cost-posting or CR-decision actions', async ({ page, baseURL }) => {
  // Finance tab of a project the contributor belongs to: read-only.
  await page.goto(`/projects/${SEED.pmProjectId}?tab=finance`);
  await expect(page.getByRole('heading', { name: 'Costs' })).toBeVisible();
  await expect(page.getByRole('table').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add cost' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Post / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Reverse / })).toHaveCount(0);

  // Finance navigation is hidden for contributors.
  await expect(page.getByRole('link', { name: 'Comparison' })).toHaveCount(0);

  // A submitted CR on the same project: no decision panel.
  const api = await apiAs('contributor', baseURL!);
  const cr = await dataOf<{ id: number }>(
    api.post(`/api/v1/projects/${SEED.pmProjectId}/change-requests`, {
      data: { title: `${runTag()} contributor request` },
    }),
  );
  await page.goto(`/change-requests/${cr.id}`);
  await expect(page.getByRole('list', { name: 'Status history' })).toBeVisible();
  for (const action of ['Approve', 'Return', 'Reject']) {
    await expect(page.getByRole('button', { name: action })).toHaveCount(0);
  }

  await api.dispose();
});
