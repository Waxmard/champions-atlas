import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Shape of the checked-in src/lib/data/pokemon-types.json the app also loads.
const typeData = JSON.parse(
  readFileSync(
    new URL('../src/lib/data/pokemon-types.json', import.meta.url),
    'utf8'
  )
) as { pokemon: Record<string, string[]> };
const pokemonTypes = typeData.pokemon;

// Mirrors $lib/catalog normalize and the $lib/types getPokemonTypes fallbacks so
// expectations come from the shipped type data instead of the filter code.
const typesOf = (pokemon: string): string[] => {
  const key = pokemon
    .toLowerCase()
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/[^a-z0-9]/g, '');
  return (
    pokemonTypes[key] ??
    pokemonTypes[
      key.replace(/mega[a-z]?$/, '').replace(/galar|alola|paldea|hisui/, '')
    ] ?? ['normal']
  );
};

const teamCards = (page: Page) =>
  page.getByRole('region', { name: 'Matching teams' }).getByRole('article');
const openTypeFilter = (page: Page) =>
  page.getByRole('button', { name: /Filter by type/ }).click();
const typeOption = (page: Page, type: string) =>
  page.getByRole('option', { name: type, exact: true });

async function openBrowse(page: Page) {
  await page.goto('/');
  // restoreBrowse canonicalizes the URL once the app is hydrated.
  await expect(page).toHaveURL(/regulation=/);
  await expect(teamCards(page).first()).toBeVisible();
}

const visibleTeams = (page: Page) =>
  teamCards(page).evaluateAll((nodes) =>
    nodes.map((node) => ({
      name: node.querySelector('h2')?.textContent?.trim() ?? '',
      members: [
        ...node.querySelectorAll('ul[aria-label="Team members"] li'),
      ].map((item) => item.querySelector('p')?.textContent?.trim() ?? ''),
    }))
  );

test('type filter selects, persists across reload, and clears', async ({
  page,
}) => {
  await openBrowse(page);
  await openTypeFilter(page);
  await page.getByRole('combobox', { name: 'Filter by type' }).click();
  await typeOption(page, 'fire').click();
  await expect(page).toHaveURL(/type=fire/);

  const chip = page.getByRole('button', { name: 'Remove fire type filter' });
  await expect(chip).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Filter by type/ })
  ).toContainText('1');

  const filtered = await visibleTeams(page);
  expect(filtered.length, 'fire filter matched no teams').toBeGreaterThan(0);
  for (const team of filtered) {
    expect(typesOf(team.members[0])).not.toEqual([]);
    expect(
      team.members.flatMap(typesOf),
      `${team.name} has no fire member`
    ).toContain('fire');
  }

  await page.reload();
  await expect(page).toHaveURL(/type=fire/);
  await expect(
    page.getByRole('button', { name: 'Remove fire type filter' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/type=/);
  await expect(
    page.getByRole('button', { name: 'Remove fire type filter' })
  ).toBeHidden();
});

test('every selected type must appear on the team', async ({ page }) => {
  await openBrowse(page);
  const baseline = await visibleTeams(page);
  const [first] = baseline;
  const distinct = [...new Set(first.members.flatMap(typesOf))];
  expect(
    distinct.length,
    `${first.name} needs two distinct types to check AND semantics`
  ).toBeGreaterThan(1);
  const [typeA, typeB] = distinct;

  await openTypeFilter(page);
  await page.getByRole('combobox', { name: 'Filter by type' }).click();
  await typeOption(page, typeA).click();
  await expect(page).toHaveURL(new RegExp(`type=${typeA}\\b`));
  await typeOption(page, typeB).click();
  await expect(page).toHaveURL(new RegExp(`type=${typeA}\\b`));
  await expect(page).toHaveURL(new RegExp(`type=${typeB}\\b`));

  const filtered = await visibleTeams(page);
  expect(filtered.map((team) => team.name)).toContain(first.name);
  expect(filtered.length).toBeLessThanOrEqual(baseline.length);
  for (const team of filtered) {
    const present = new Set(team.members.flatMap(typesOf));
    for (const type of [typeA, typeB])
      expect(present.has(type), `${team.name} is missing ${type}`).toBe(true);
  }
});
