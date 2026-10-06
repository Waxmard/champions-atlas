import { expect, test, type Page } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

// e2e sits outside the SvelteKit tsconfig project, so the generated JSON import
// resolves to {}; the shape is owned by scripts/import-catalog.mjs.
const catalogTeams = (
  catalog as { teams: { id: string; name: string; sheetIds: string[] }[] }
).teams;
const peter = catalogTeams.find((team) => team.sheetIds.includes('MB809'))!;

const reloadButton = (page: Page) =>
  page.getByRole('button', { name: 'Reload to update', exact: true });

const hydrated = (page: Page) =>
  expect(
    page.getByRole('link', { name: 'My teams', exact: true })
  ).toBeVisible();

const resume = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

function countDocumentLoads(page: Page) {
  let loads = 0;
  page.on('load', () => loads++);
  return () => loads;
}

test('a matching build stamp neither reloads nor prompts', async ({ page }) => {
  await page.route('**/version.json', (route) =>
    route.fulfill({ json: { buildId: 'e2e' } })
  );
  const loads = countDocumentLoads(page);
  await page.goto('/');
  await hydrated(page);
  await page.waitForTimeout(500);
  expect(loads()).toBe(1);
  await expect(reloadButton(page)).toHaveCount(0);
});

test('a changed build reloads once and then prompts instead of reloading again', async ({
  page,
}) => {
  await page.route('**/version.json', (route) =>
    route.fulfill({ json: { buildId: 'newer-build' } })
  );
  const loads = countDocumentLoads(page);
  await page.goto('/');
  await hydrated(page);
  await expect.poll(loads, { timeout: 15_000 }).toBe(2);
  await hydrated(page);
  await expect(reloadButton(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(loads()).toBe(2);
});

test('a resumed app with an open editor prompts instead of reloading', async ({
  page,
}) => {
  let buildId = 'e2e';
  await page.route('**/version.json', (route) =>
    route.fulfill({ json: { buildId } })
  );
  const loads = countDocumentLoads(page);
  await page.goto('/teams/' + peter.id);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    peter.name
  );
  await page
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expect(editor).toBeVisible();

  buildId = 'newer-build';
  await resume(page);

  await expect(reloadButton(page)).toBeVisible();
  await expect(editor).toBeVisible();
  expect(loads()).toBe(1);
});
