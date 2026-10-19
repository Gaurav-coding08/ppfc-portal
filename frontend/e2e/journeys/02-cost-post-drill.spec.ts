import { expect, test } from '@playwright/test';
import { runTag, SEED, storageStatePath } from '../support/accounts.ts';
import { apiAs, createProjectAsPm, dataOf } from '../support/api.ts';
import { expectToast } from '../support/ui.ts';

test.use({ storageState: storageStatePath('pm') });

interface Financials {
  actualSpend: number;
}

// Acceptance test B: a PM adds a draft cost and posts it; the finance
// summary's actual spend increases by exactly that amount, and the Actual
// spend drill-down lists the transaction.
test('PM posts a draft cost; actual spend increases and the drill-down lists it', async ({
  page,
  baseURL,
}) => {
  const tag = runTag();
  const description = `${tag} vendor invoice`;

  // Setup: a fresh project (no costs yet), so the before/after values are exact.
  const api = await apiAs('pm', baseURL!);
  const me = await dataOf<{ user: { id: number } }>(api.get('/api/v1/auth/me'));
  const project = await createProjectAsPm(api, {
    name: `${tag} finance check`,
    ownerId: me.user.id,
    departmentId: SEED.digitalPlatformsDepartmentId,
  });
  const summary = () =>
    dataOf<{ financials: Financials }>(api.get(`/api/v1/projects/${project.id}/financial-summary`));
  expect((await summary()).financials.actualSpend).toBe(0);

  await page.goto(`/projects/${project.id}?tab=finance`);
  const actualSpendCard = page.getByRole('button', { name: /^Actual spend: show the posted transactions/ });
  await expect(actualSpendCard).toContainText('AED');
  const before = await actualSpendCard.innerText();

  // Draft first: a draft never counts towards actual spend.
  await page.getByRole('button', { name: 'Add cost' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add cost' });
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option').first().click();
  await sheet.getByLabel('Date').fill('2026-09-15');
  await sheet.getByLabel('Amount (AED)').fill('1234.56');
  await sheet.getByLabel('Description').fill(description);
  await sheet.getByRole('button', { name: 'Add draft' }).click();
  await expectToast(page, /draft/i);
  expect((await summary()).financials.actualSpend).toBe(0);

  // Post it, through the confirmation dialog.
  await page.getByRole('button', { name: `Post ${description}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Post cost' }).click();
  await expectToast(page, /posted/i);

  // The card refetches (never patched in the browser) and the API agrees.
  await expect(actualSpendCard).not.toHaveText(before);
  expect((await summary()).financials.actualSpend).toBe(1234.56);

  // Drill-down: the costs table filters to the posted rows behind the number.
  await actualSpendCard.click();
  await expect(page).toHaveURL(/status=posted/);
  await expect(page.getByRole('row', { name: new RegExp(description) })).toBeVisible();

  await api.dispose();
});
