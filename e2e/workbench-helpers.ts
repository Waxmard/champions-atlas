import { expect, type Locator, type Page } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

const peterFixture = catalog.teams.find((team) =>
  team.sheetIds.includes('MB809')
);
if (!peterFixture) throw new Error('catalog is missing the Peter fixture team');

export const peter = peterFixture;

export const missing = (what: string): never => {
  throw new Error(`missing ${what}`);
};

export async function openWorkbench(page: Page) {
  await page.goto('/teams/' + peter.id);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    peter.name
  );
}

export async function expectMovesSubView(editor: Locator) {
  for (const slot of [1, 2, 3, 4]) {
    await expect(
      editor.getByLabel(`Move ${slot}`, { exact: true })
    ).toBeVisible();
  }
}

export async function expectDetailsSubView(editor: Locator) {
  await expect(editor.getByLabel('Item', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Ability', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Nature', { exact: true })).toBeVisible();
}
