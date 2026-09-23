import { expect, test, type Page } from '@playwright/test';

const teamId = 'm-c-b2039b4436fb6729';
const teamName = "Danyul_YT's Raichu-Y Floette Team";
const pokemon = 'Raichu-Mega-Y';
const storageKey = 'champions-atlas:teams:v1';

async function openWorkbench(page: Page) {
  await page.goto(`/teams/${teamId}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    teamName
  );
}

test('use a benchmark spread as a draft, then apply and reload it', async ({
  page,
}) => {
  await openWorkbench(page);
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey
  );
  const card = page.getByRole('region', {
    name: `${pokemon} set`,
    exact: true,
  });
  await card
    .getByRole('button', { name: `Edit ${pokemon} EVs`, exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: `Edit ${pokemon} set`,
    exact: true,
  });
  await expect(editor.getByLabel('HP EV', { exact: true })).toHaveValue('18');
  await expect(editor.getByLabel('Def EV', { exact: true })).toHaveValue('25');
  await expect(editor.getByLabel('Spe EV', { exact: true })).toHaveValue('23');
  await expect(
    editor.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
  ).toBeVisible();
  await expect(editor.getByLabel('Battle form', { exact: true })).toHaveValue(
    pokemon
  );
  await expect(
    editor.getByText('Total stats 831', { exact: true })
  ).toBeVisible();

  await editor
    .getByRole('button', { name: 'Benchmark against the meta', exact: true })
    .click();
  await expect(
    editor.getByRole('heading', { name: 'EV benchmarks', exact: true })
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);

  await editor
    .getByLabel('Search all species', { exact: true })
    .fill('Sneasler');
  await editor.getByRole('button', { name: /Sneasler/ }).click();
  const matchup = editor.locator('section[aria-label="Selected matchup"]');
  const variants = matchup.getByLabel('Recorded set variant', { exact: true });
  const labels = await variants.locator('option').allTextContents();
  const variant = labels.findIndex(
    (label) =>
      label.includes('2 HP / 32 Atk / 32 Spe') &&
      label.includes('Adamant') &&
      label.includes('White Herb') &&
      label.includes('Unburden')
  );
  expect(variant).toBeGreaterThanOrEqual(0);
  await variants.selectOption({ index: variant });
  await matchup
    .getByLabel('Opponent attack', { exact: true })
    .selectOption('Close Combat');
  await expect(matchup).toContainText('Survives 68.75% of damage rolls');

  const conditions = editor.locator('details > summary');
  await conditions.click();
  const form = editor.getByLabel('Your Pokémon battle form', { exact: true });
  await form.selectOption('Raichu');
  await expect(form).toHaveValue('Raichu');
  const hp = editor.getByLabel('Your Pokémon HP remaining percentage', {
    exact: true,
  });
  await hp.fill('50');
  await expect(conditions).toContainText('Your Pokémon 50% HP');
  await hp.fill('100');
  await form.selectOption(pokemon);

  await editor.getByRole('button', { name: 'Find EV adjustments' }).click();
  const suggestion = editor
    .locator('li')
    .filter({ hasText: '18 HP / 31 Def / 17 Spe' });
  await expect(suggestion).toContainText('survival 100%');
  await suggestion
    .getByRole('button', { name: 'Use spread', exact: true })
    .click();
  await expect(
    editor.getByRole('button', {
      name: 'Benchmark against the meta',
      exact: true,
    })
  ).toBeFocused();
  await expect(editor.getByLabel('HP EV', { exact: true })).toHaveValue('18');
  await expect(editor.getByLabel('Def EV', { exact: true })).toHaveValue('31');
  await expect(editor.getByLabel('Spe EV', { exact: true })).toHaveValue('17');
  await expect(
    editor.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
  ).toBeVisible();
  await expect(
    editor.getByText('Total stats 830', { exact: true })
  ).toBeVisible();
  for (const stat of [
    'HP 153',
    'Atk 108',
    'Def 106',
    'SpA 180',
    'SpD 100',
    'Spe 183',
  ])
    await expect(
      editor.getByLabel('EV editor').getByText(stat, { exact: true })
    ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(before);

  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(card.getByRole('button', { name: /Apply/ })).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(before);
  await card.getByRole('button', { name: /Apply/ }).click();
  await expect(page.getByRole('status')).toHaveText(
    `${pokemon} changes applied and saved.`
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).not.toBe(before);

  await page.reload();
  await card
    .getByRole('button', { name: `Edit ${pokemon} EVs`, exact: true })
    .click();
  const savedEditor = page.getByRole('dialog', {
    name: `Edit ${pokemon} set`,
    exact: true,
  });
  await expect(savedEditor.getByLabel('Def EV', { exact: true })).toHaveValue(
    '31'
  );
  await expect(savedEditor.getByLabel('Spe EV', { exact: true })).toHaveValue(
    '17'
  );
  await expect(
    savedEditor.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
  ).toBeVisible();
  await expect(
    savedEditor.getByText('Total stats 830', { exact: true })
  ).toBeVisible();
});
