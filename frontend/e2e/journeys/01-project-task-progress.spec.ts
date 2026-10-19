import { expect, test } from '@playwright/test';
import { ACCOUNTS, runTag, SEED, storageStatePath } from '../support/accounts.ts';
import { apiAs, dataOf } from '../support/api.ts';
import { chooseOption, expectToast } from '../support/ui.ts';

// Journey 2 / acceptance test A: a PM creates a project and a task, the
// assigned contributor updates progress, and the value survives a reload
// (it was persisted by the API, not held in browser state).
test('PM creates a project and task; contributor updates progress and it persists', async ({
  browser,
  baseURL,
}) => {
  const tag = runTag();
  const projectName = `${tag} rollout`;
  const taskTitle = `${tag} configure gateway`;

  // --- PM: create the project through the form ---------------------------
  const pmContext = await browser.newContext({ storageState: storageStatePath('pm') });
  const pm = await pmContext.newPage();
  await pm.goto('/projects');
  await pm.getByRole('button', { name: 'New project' }).click();

  const sheet = pm.getByRole('dialog', { name: 'New project' });
  await sheet.getByLabel('Name').fill(projectName);
  await chooseOption(pm, 'Department', SEED.digitalPlatformsDepartmentName);
  await sheet.getByLabel('Start date').fill('2026-07-01');
  await sheet.getByLabel('End date').fill('2027-06-30');
  await sheet.getByLabel('Initial approved budget (AED)').fill('50000');
  await sheet.getByRole('button', { name: 'Create project' }).click();

  await expectToast(pm, /Project PRJ-\d+ created/);
  await expect(pm).toHaveURL(/\/projects\/\d+/);
  const projectId = Number(/\/projects\/(\d+)/.exec(pm.url())![1]);
  await expect(pm.getByRole('heading', { name: projectName })).toBeVisible();

  // Setup only: make the contributor a member so the task can be assigned
  // to them (the Members tab UI is covered by component tests).
  const pmApi = await apiAs('pm', baseURL!);
  const contributorApi = await apiAs('contributor', baseURL!);
  const me = await dataOf<{ user: { id: number } }>(contributorApi.get('/api/v1/auth/me'));
  await dataOf(
    pmApi.post(`/api/v1/projects/${projectId}/members`, {
      data: { userId: me.user.id, memberRole: 'contributor' },
    }),
  );

  // --- PM: add a task assigned to the contributor ------------------------
  await pm.goto(`/projects/${projectId}?tab=tasks`);
  // A brand-new project has no tasks, so the empty state repeats the action.
  await pm.getByRole('button', { name: 'New task' }).first().click();
  const taskSheet = pm.getByRole('dialog', { name: 'New task' });
  await taskSheet.getByLabel('Title').fill(taskTitle);
  await chooseOption(pm, 'Assignee', ACCOUNTS.contributor.fullName);
  await taskSheet.getByLabel('Start date').fill('2026-08-01');
  await taskSheet.getByLabel('Due date').fill('2026-12-15');
  await taskSheet.getByRole('button', { name: 'Create task' }).click();
  await expectToast(pm, 'Task created');
  await expect(pm.getByRole('cell', { name: taskTitle, exact: true })).toBeVisible();

  // --- Contributor: update progress from My tasks ------------------------
  const contributorContext = await browser.newContext({ storageState: storageStatePath('contributor') });
  const contributor = await contributorContext.newPage();
  await contributor.goto('/my-tasks');
  const progress = contributor.getByRole('spinbutton', { name: `Progress for ${taskTitle}` });
  await expect(progress).toHaveValue('0');
  await progress.fill('40');
  await contributor.getByRole('button', { name: 'Save' }).click();
  await expectToast(contributor, 'Progress saved');

  // Reload: the value comes back from the API.
  await contributor.reload();
  await expect(contributor.getByRole('spinbutton', { name: `Progress for ${taskTitle}` })).toHaveValue('40');

  // The PM sees the same persisted value on the project's task list.
  await pm.reload();
  await expect(pm.getByRole('row', { name: new RegExp(taskTitle) })).toContainText('40');

  await Promise.all([
    pmApi.dispose(),
    contributorApi.dispose(),
    pmContext.close(),
    contributorContext.close(),
  ]);
});
