import { expect, test } from '@playwright/test';

const delay = (ms: number) => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

// Regression guard: with app JS delayed, the SSR-rendered "Clear filters"
// button must stay inert until hydration, then still clear the filter.
test('clear filters survives a hydration race', async ({ page }) => {
  await page.route('**/_app/immutable/**/*.js', async (route) => {
    await delay(2_000);
    await route.continue();
  });
  await page.goto('/?member=invalid', { waitUntil: 'commit' });
  await expect(
    page.getByRole('heading', { name: 'Invalid filter link' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).last().click();
  await expect(page).not.toHaveURL(/member=/);
});
