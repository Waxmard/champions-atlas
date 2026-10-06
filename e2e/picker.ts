import { expect, type Locator, type Page } from '@playwright/test';

export async function chooseOption(page: Page, picker: Locator, name: string) {
  await expect(async () => {
    await picker.fill(name);
    await expect(page.getByRole('option', { name, exact: true })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await picker.press('ArrowDown');
  await picker.press('Enter');
}
