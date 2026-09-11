import { expect, test } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

const peter = catalog.teams.find((team) => team.sheetIds.includes('MB809'))!;
const storageKey = 'champions-atlas:teams:v1';

test('save Peter, lock Weavile, compare, edit, export, and reopen without changing original', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/teams/${peter.id}`);
  await expect(
    page
      .getByRole('region', { name: 'Pokémon sets' })
      .getByText('Moves not loaded. Check the original paste.')
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    peter.name
  );
  const workbenchUrl = page.url();
  const original = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0].original,
    storageKey
  );
  expect(
    original.members.every((member: { spread: string }) => !!member.spread)
  ).toBe(true);
  const weavile = page.getByRole('region', {
    name: 'Weavile locks',
    exact: true,
  });
  await weavile
    .getByRole('checkbox', { name: 'Keep Weavile', exact: true })
    .check();
  await expect(
    page.getByText('No teams match these locks and regulation.', {
      exact: false,
    })
  ).toBeVisible();
  await page.getByLabel('Candidate regulation').selectOption('all');
  const alternatives = page
    .getByRole('region', { name: 'Similar teams', exact: true })
    .getByRole('article');
  await expect(alternatives.first()).toBeVisible();
  await alternatives
    .first()
    .getByRole('button', { name: /^Compare / })
    .click();
  const comparison = page.getByRole('region', { name: 'Selected comparison' });
  await expect(comparison).toBeVisible();
  await expect(
    comparison.getByRole('table', { name: 'Team differences' })
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('comparison.png') });
  await comparison
    .getByRole('button', { name: 'Use candidate as edited copy' })
    .click();
  await expect(
    weavile.getByRole('checkbox', { name: 'Keep Weavile', exact: true })
  ).toBeChecked();
  await page
    .getByLabel('Team name', { exact: true })
    .fill('My Weavile adaptation');
  await weavile.getByText('Edit set', { exact: true }).click();
  const set = weavile.getByLabel('Set text for Weavile', { exact: true });
  const setText = await set.inputValue();
  await set.fill(`${setText}\n- Protect`);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('more than four moves');
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!)[0].name,
      storageKey
    )
  ).toBe(peter.name);
  await set.fill(setText.replace(/EVs: [^\n]+/, 'EVs: 32 HP / 32 Atk / 2 Spe'));
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Changes saved on this device.'
  );
  await page.reload();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    'My Weavile adaptation'
  );
  await expect(
    weavile.getByRole('checkbox', { name: 'Keep Weavile', exact: true })
  ).toBeChecked();
  await page
    .getByRole('button', { name: 'Copy team text', exact: true })
    .click();
  await expect(page.getByLabel('Export text', { exact: true })).toHaveValue(
    /EVs: 32 HP \/ 32 Atk \/ 2 Spe/
  );
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  expect(stored.original).toEqual(original);
  expect(stored.sources.length).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.goto('/');
  await page.goto(workbenchUrl);
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    'My Weavile adaptation'
  );
  expect(errors).toEqual([]);
});

test('corrupt storage is reported and kept; missing local IDs do not show another team', async ({
  page,
}) => {
  await page.goto('/my-teams?team=missing');
  await expect(page.getByRole('status')).toContainText('not on this device');
  await page.evaluate(
    (key) => localStorage.setItem(key, '{broken'),
    storageKey
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('left untouched');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe('{broken');
});
