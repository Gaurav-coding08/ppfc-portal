import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { storageStatePath } from './support/accounts.ts';

// Regenerates the README / docs screenshots in docs/screenshots/. Not part
// of the normal smoke run; enable it explicitly:
//   SCREENSHOTS=1 npx playwright test screenshots
// Best taken right after `npm run db:reset` so no E2E-created records show.
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate docs/screenshots');
test.use({ storageState: storageStatePath('admin'), viewport: { width: 1440, height: 1000 } });

const OUT = path.join(import.meta.dirname, '..', '..', 'docs', 'screenshots');

async function shoot(page: Page, url: string, file: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0);
  await page.screenshot({ path: path.join(OUT, file) });
}

test('docs screenshots', async ({ page }) => {
  await shoot(page, '/dashboard', 'dashboard.png');
  await shoot(page, '/projects/2?tab=overview', 'project-detail.png');
  await shoot(page, '/projects/2?tab=finance', 'finance-tab.png');
  await shoot(page, '/change-requests/3', 'change-request-detail.png');
});
