import { expect, test, type Locator, type Page } from '@playwright/test';
import { runTag, SEED, storageStatePath } from '../support/accounts.ts';
import { apiAs, dataOf } from '../support/api.ts';
import { expectToast } from '../support/ui.ts';

test.use({ storageState: storageStatePath('pm') });

// Keyboard-only walk (feature 18 Part C accessibility pass): project → task
// edit → cost post → CR decision using only Tab / Shift+Tab / Enter / Esc.
// (Keyboard sign-in is covered by auth.setup.ts.) Along the way it checks a
// visible focus indicator, the focus trap inside dialogs, Esc to close, and
// focus returning to the control that opened the dialog.

// Presses Tab until `target` has focus, the way a keyboard user would reach it.
async function tabTo(page: Page, target: Locator, maxPresses = 80) {
  for (let i = 0; i < maxPresses; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach ${target} with the Tab key`);
}

async function expectVisibleFocus(target: Locator) {
  const indicator = await target.evaluate((el) => {
    const style = getComputedStyle(el);
    return { outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px', ring: style.boxShadow };
  });
  expect(indicator.outline || indicator.ring !== 'none', 'focused control shows a focus ring').toBe(true);
}

// A tablist is one Tab stop (the selected tab); arrow keys move between
// tabs and Enter activates one — the WAI-ARIA tabs pattern.
async function openTab(page: Page, name: string) {
  await tabTo(page, page.getByRole('tab', { selected: true }), 120);
  const target = page.getByRole('tab', { name });
  for (let i = 0; i < 10 && !(await target.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(target).toBeFocused();
  await expectVisibleFocus(target);
  await page.keyboard.press('Enter');
  await expect(target).toHaveAttribute('aria-selected', 'true');
}

// Tab around inside an open dialog: focus must never escape it. Base UI
// wraps the dialog in hidden "focus guard" sentinels that bounce focus back
// in on the next tick, so each step polls until focus has settled.
async function expectFocusTrapped(page: Page, dialog: Locator) {
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)), {
        message: `Tab #${i + 1} moved focus out of the dialog`,
        timeout: 1000,
      })
      .toBe(true);
  }
}

test('keyboard-only: open a project, edit a task, post a cost, decide a CR', async ({ page, baseURL }) => {
  const tag = runTag();
  const pmApi = await apiAs('pm', baseURL!);
  const contributorApi = await apiAs('contributor', baseURL!);
  // Setup: one draft cost to post and one CR to decide on the PM's project.
  const categories = await dataOf<{ id: number }[]>(pmApi.get('/api/v1/cost-categories'));
  const costDescription = `${tag} keyboard cost`;
  await dataOf(
    pmApi.post(`/api/v1/projects/${SEED.pmProjectId}/costs`, {
      data: {
        categoryId: categories[0]!.id,
        txnDate: '2026-09-20',
        amount: 10,
        description: costDescription,
      },
    }),
  );
  const cr = await dataOf<{ id: number }>(
    contributorApi.post(`/api/v1/projects/${SEED.pmProjectId}/change-requests`, {
      data: { title: `${tag} keyboard request` },
    }),
  );

  // 1. Projects list → project detail.
  await page.goto('/projects');
  const projectLink = page.getByRole('link', { name: /^PRJ-001/ }).first();
  await tabTo(page, projectLink);
  await expectVisibleFocus(projectLink);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/projects/${SEED.pmProjectId}`));

  // 2. Tasks tab → Edit task sheet (focus trap, Esc, focus return).
  await openTab(page, 'Tasks');
  const editTask = page.getByRole('button', { name: /^Edit / }).first();
  await tabTo(page, editTask);
  await expectVisibleFocus(editTask);
  await page.keyboard.press('Enter');
  const taskSheet = page.getByRole('dialog', { name: 'Edit task' });
  await expect(taskSheet).toBeVisible();
  await expectFocusTrapped(page, taskSheet);
  await page.keyboard.press('Escape');
  await expect(taskSheet).toBeHidden();
  await expect(editTask).toBeFocused();

  // 3. Finance tab → Post the draft through its confirmation dialog.
  await openTab(page, 'Finance');
  const post = page.getByRole('button', { name: `Post ${costDescription}` });
  await tabTo(page, post, 200);
  await page.keyboard.press('Enter');
  const confirmPost = page.getByRole('alertdialog');
  await expect(confirmPost).toBeVisible();
  await expectFocusTrapped(page, confirmPost);
  await page.keyboard.press('Escape'); // Esc cancels: nothing is posted.
  await expect(confirmPost).toBeHidden();
  await expect(post).toBeFocused();
  await page.keyboard.press('Enter');
  await tabTo(page, confirmPost.getByRole('button', { name: 'Post cost' }));
  await page.keyboard.press('Enter');
  await expectToast(page, /posted/i);

  // 4. Change request → approve with a reason.
  await page.goto(`/change-requests/${cr.id}`);
  const reason = page.getByLabel('Reason');
  await tabTo(page, reason);
  await expectVisibleFocus(reason);
  await page.keyboard.type('Approved from the keyboard');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Approve' })).toBeFocused();
  await page.keyboard.press('Enter');
  const confirmDecision = page.getByRole('alertdialog');
  await tabTo(page, confirmDecision.getByRole('button', { name: 'Approve' }));
  await page.keyboard.press('Enter');
  await expectToast(page, 'Change request approved');

  await Promise.all([pmApi.dispose(), contributorApi.dispose()]);
});
