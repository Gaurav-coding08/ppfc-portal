import fs from 'node:fs';
import { expect, request, test as setup } from '@playwright/test';
import { ACCOUNTS, PASSWORD, storageStatePath, type Role } from './support/accounts.ts';

// Logs in through the real login form once per role and saves the session
// cookie for the journeys.
//
// A saved session is reused while `GET /auth/me` still accepts it (JWT
// lifetime 8 h). The backend allows 10 login attempts per 15 minutes per IP,
// so logging in fresh on every run would lock the suite out after three runs.
for (const role of Object.keys(ACCOUNTS) as Role[]) {
  setup(`sign in as ${role}`, async ({ page, baseURL }) => {
    const file = storageStatePath(role);

    if (fs.existsSync(file)) {
      const api = await request.newContext({ baseURL, storageState: file });
      const me = await api.get('/api/v1/auth/me');
      await api.dispose();
      if (me.ok()) return;
    }

    // Keyboard-only sign-in: Tab into each field, Enter submits the form.
    await page.goto('/login');
    await page.getByLabel('Email').focus();
    await page.keyboard.type(ACCOUNTS[role].email);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password')).toBeFocused();
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');

    // Every role lands on the dashboard after login.
    await expect(page).toHaveURL(/\/dashboard/);
    await page.context().storageState({ path: file });
  });
}
