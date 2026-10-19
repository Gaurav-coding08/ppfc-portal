import { expect, test } from '@playwright/test';
import { runTag, SEED, storageStatePath } from '../support/accounts.ts';
import { apiAs, dataOf } from '../support/api.ts';
import { expectToast } from '../support/ui.ts';

test.use({ storageState: storageStatePath('pm') });

// Acceptance test C: the PM approves a contributor's change request; the
// detail page shows exactly one new history entry, written in the same
// transaction as the status change.
test('PM approves a change request; exactly one new history entry appears', async ({ page, baseURL }) => {
  // Setup: the contributor submits a fresh CR on the PM's project, so the PM
  // is allowed to decide it (never their own).
  const contributorApi = await apiAs('contributor', baseURL!);
  const cr = await dataOf<{ id: number; code: string }>(
    contributorApi.post(`/api/v1/projects/${SEED.pmProjectId}/change-requests`, {
      data: { title: `${runTag()} extend testing window` },
    }),
  );

  await page.goto(`/change-requests/${cr.id}`);
  const history = page.getByRole('list', { name: 'Status history' }).getByRole('listitem');
  await expect(history).toHaveCount(1);

  await page.getByLabel('Reason').fill('Scope agreed with the sponsor');
  await page.getByRole('button', { name: 'Approve' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('does not change the project budget');
  await confirm.getByRole('button', { name: 'Approve' }).click();
  await expectToast(page, 'Change request approved');

  await expect(history).toHaveCount(2);
  await expect(history.last()).toContainText('Approved');
  await expect(history.last()).toContainText('Scope agreed with the sponsor');
  // The decision panel is gone: an approved CR can't be decided again.
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  await contributorApi.dispose();
});
