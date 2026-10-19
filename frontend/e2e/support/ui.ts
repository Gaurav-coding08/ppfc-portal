import { expect, type Page } from '@playwright/test';

// Picks an option in a SelectField / FilterSelect. These are Base UI
// listboxes, not native <select>s: open the combobox, then click the option.
export async function chooseOption(page: Page, comboboxName: string | RegExp, option: string | RegExp) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: option }).click();
}

// Success toasts are rendered by sonner in an aria-live region.
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible();
}
