import { expect, test } from '@playwright/test';
import { SEED, storageStatePath } from '../support/accounts.ts';
import { apiAs } from '../support/api.ts';
import { chooseOption } from '../support/ui.ts';

test.use({ storageState: storageStatePath('admin') });

// Acceptance test E: filter the dashboard by department, open the Actual
// spend drill-down, and see a record count that matches the drill endpoint
// for the same filter context.
test('dashboard department filter + finance drill-down shows the record count', async ({ page, baseURL }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('region', { name: 'Financial' })).toBeVisible();

  await chooseOption(page, 'Department', SEED.digitalPlatformsDepartmentName);
  await expect(page).toHaveURL(new RegExp(`departmentId=${SEED.digitalPlatformsDepartmentId}`));

  await page.getByRole('button', { name: 'Actual spend: show records' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText(SEED.digitalPlatformsDepartmentName);
  const count = drawer.getByText(/^\d+ records?/);
  await expect(count).toBeVisible();

  // Reconcile with the API: the drawer's N is the drill endpoint's total for
  // the same filters (the Actual spend KPI ignores category, so none is sent).
  const api = await apiAs('admin', baseURL!);
  const response = await api.get(
    `/api/v1/dashboard/drill/costs?departmentId=${SEED.digitalPlatformsDepartmentId}&pageSize=1`,
  );
  const { meta } = (await response.json()) as { meta: { total: number } };
  expect(meta.total).toBeGreaterThan(0);
  await expect(count).toHaveText(new RegExp(`^${meta.total} records?`));
  // At least one linked record is listed.
  await expect(drawer.getByRole('row').nth(1)).toBeVisible();

  await api.dispose();
});
