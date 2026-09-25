import { expect, test, type Locator, type Page } from '@playwright/test';

const raichuTeamId = 'm-c-b2039b4436fb6729';
const raichuTeamName = "Danyul_YT's Raichu-Y Floette Team";
const glimmoraTeamId = 'm-c-08798c511d2ae783';
const glimmoraTeamName = "DomingoVGC's Salamence Hippowdon Team";
const storageKey = 'champions-atlas:teams:v1';

async function openEditor(
  page: Page,
  teamId: string,
  teamName: string,
  pokemon: string
) {
  await page.goto(`/teams/${teamId}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    teamName
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
  return {
    card,
    editor,
    suggestions: editor.getByRole('region', { name: 'EV spread suggestions' }),
    benchmarks: editor.getByRole('region', { name: 'EV benchmarks' }),
  };
}

async function ask(
  page: Page,
  editor: Locator,
  benchmarks: Locator,
  options: { goal: string; opponent: string; item?: string; move?: string }
) {
  await editor.getByRole('radio', { name: options.goal, exact: true }).check();
  await benchmarks
    .getByRole('combobox', { name: 'Opponent', exact: true })
    .fill(options.opponent);
  await page
    .getByRole('option', { name: options.opponent, exact: true })
    .click();
  if (options.item)
    await benchmarks
      .getByLabel('Opponent item', { exact: true })
      .selectOption({ label: options.item });
  if (options.move)
    await benchmarks
      .getByLabel('Move', { exact: true })
      .selectOption({ label: options.move });
  await expect(benchmarks).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000,
  });
  await expect(benchmarks.getByRole('status')).toBeVisible({
    timeout: 30_000,
  });
}

const chipsOf = (row: Locator) => row.locator('span.font-mono');

test('a same-nature answer stages first and saves only on Apply', async ({
  page,
}) => {
  const { card, editor, benchmarks } = await openEditor(
    page,
    raichuTeamId,
    raichuTeamName,
    'Raichu-Mega-Y'
  );
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey
  );
  await expect(editor.getByLabel('HP EV', { exact: true })).toHaveValue('18');
  await expect(
    editor.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
  ).toBeVisible();
  await expect(editor.getByLabel('Battle form')).toHaveCount(0);
  await expect(editor.getByLabel('Search all species')).toHaveCount(0);

  await ask(page, editor, benchmarks, {
    goal: 'Survive a hit',
    opponent: 'Basculegion',
    item: 'Choice Scarf',
    move: 'Wave Crash',
  });
  await expect(benchmarks).toContainText('Basculegion @ Choice Scarf');
  await expect(benchmarks.getByRole('status')).toHaveText(
    'Your Timid spread can reach this by moving 19 points.'
  );
  await expect(
    benchmarks.getByRole('heading', { name: 'With your Timid nature' })
  ).toBeVisible();
  const row = benchmarks
    .getByRole('button', { name: /^Use Timid spread / })
    .first();
  await expect(chipsOf(row)).toHaveText(['30 HP', '32 Def', '4 Spe']);
  await expect(row).toContainText('19 points moved');
  await expect(row).toContainText('survives 16/16 rolls (max 164 of 165 HP)');

  await row.click();
  for (const [stat, value] of [
    ['HP', '30'],
    ['Atk', '0'],
    ['Def', '32'],
    ['SpA', '0'],
    ['SpD', '0'],
    ['Spe', '4'],
  ])
    await expect(editor.getByLabel(`${stat} EV`, { exact: true })).toHaveValue(
      value
    );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(before);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(card.getByRole('button', { name: /Apply/ })).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(before);
  await card.getByRole('button', { name: /Apply/ }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Raichu-Mega-Y changes applied and saved.' })
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).not.toBe(before);
});

test('a nature-change answer leads with the cheapest equal-cost spread', async ({
  page,
}) => {
  const { editor, benchmarks } = await openEditor(
    page,
    glimmoraTeamId,
    glimmoraTeamName,
    'Glimmora-Mega'
  );
  await ask(page, editor, benchmarks, {
    goal: 'Survive a hit',
    opponent: 'Gholdengo',
    item: 'Life Orb',
    move: 'Make It Rain',
  });
  await expect(benchmarks).toContainText('Gholdengo @ Life Orb');
  await expect(benchmarks.getByRole('status')).toHaveText(
    'This needs a different nature: Calm, moving 52 points.'
  );
  await expect(
    benchmarks.getByRole('heading', { name: 'With your Timid nature' })
  ).toBeVisible();
  await expect(benchmarks).toContainText(
    'No 66-point spread reaches this with Timid.'
  );
  await expect(
    benchmarks.getByRole('heading', { name: 'Needs a different nature' })
  ).toBeVisible();
  const row = benchmarks
    .getByRole('button', { name: /^Use Calm spread / })
    .first();
  await expect(chipsOf(row)).toHaveText(['22 HP', '32 SpD', '12 Spe']);
  await expect(row).toContainText('52 points moved');
  await expect(row).toContainText('survives 16/16 rolls (max 179 of 180 HP)');
  await expect(benchmarks).toContainText('+7 more at the same cost');
});

test('an unreachable Speed target names the ceiling', async ({ page }) => {
  const { editor, benchmarks } = await openEditor(
    page,
    raichuTeamId,
    raichuTeamName,
    'Raichu-Mega-Y'
  );
  await ask(page, editor, benchmarks, {
    goal: 'Outspeed',
    opponent: 'Basculegion',
    item: 'Choice Scarf',
  });
  await expect(benchmarks).toContainText('Basculegion @ Choice Scarf');
  await expect(benchmarks.getByRole('status')).toContainText(
    'No 66-point spread reaches this;'
  );
  await expect(benchmarks).toContainText('Maximum Speed is 200 with Timid.');
  await expect(
    benchmarks.getByRole('button', { name: /^Use .* spread / })
  ).toHaveCount(0);
});

test('a move that cannot deal damage is reported without a spread claim', async ({
  page,
}) => {
  const { editor, benchmarks } = await openEditor(
    page,
    raichuTeamId,
    raichuTeamName,
    'Raichu-Mega-Y'
  );
  await ask(page, editor, benchmarks, {
    goal: 'Take a KO',
    opponent: 'Gholdengo',
    item: 'Life Orb',
    move: 'Focus Blast',
  });
  await expect(benchmarks.getByRole('status')).toHaveText(
    'Focus Blast deals no damage to Gholdengo.'
  );
  await expect(
    benchmarks.getByRole('button', { name: /^Use .* spread / })
  ).toHaveCount(0);
});

test('the panel starts empty, keeps the dialog inside the viewport and layers below Speed tiers', async ({
  page,
}) => {
  const { editor, suggestions, benchmarks } = await openEditor(
    page,
    raichuTeamId,
    raichuTeamName,
    'Raichu-Mega-Y'
  );
  await expect(benchmarks).toContainText(
    'Choose an opponent to benchmark against.'
  );
  await expect(benchmarks).toHaveAttribute('aria-busy', 'false');
  expect(
    await editor.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);

  const details = suggestions.locator('details');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('Unmodified Speed');

  await ask(page, editor, benchmarks, {
    goal: 'Survive a hit',
    opponent: 'Basculegion',
  });
  await expect(benchmarks.getByRole('status')).toBeVisible();
  await expect(benchmarks).toHaveAttribute('aria-busy', 'false');
  expect(
    await editor.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true);
});

test('a spread another saved team runs stages and saves', async ({ page }) => {
  const pokemon = 'Raichu-Mega-Y';
  const { card, editor } = await openEditor(
    page,
    raichuTeamId,
    raichuTeamName,
    pokemon
  );
  await page.evaluate(
    ({ key, teamId, spread, pokemon }) => {
      const teams = JSON.parse(localStorage.getItem(key)!);
      const copy = JSON.parse(
        JSON.stringify(teams.find((team) => team.original.id === teamId))
      );
      copy.id = '11111111-1111-4111-8111-111111111111';
      copy.name = 'Copied team';
      const member = copy.members.find((entry) => entry.pokemon === pokemon);
      member.spread = spread;
      delete member.set;
      teams.push(copy);
      localStorage.setItem(key, JSON.stringify(teams));
    },
    {
      key: storageKey,
      teamId: raichuTeamId,
      spread: '18 HP / 26 Def / 22 Spe',
      pokemon,
    }
  );
  await page.reload();
  await card
    .getByRole('button', { name: `Edit ${pokemon} EVs`, exact: true })
    .click();
  const suggestions = page
    .getByRole('dialog', { name: `Edit ${pokemon} set`, exact: true })
    .getByRole('region', { name: 'EV spread suggestions' });
  await expect(suggestions).toContainText(
    'Spreads your own teams already run on this Pokémon.'
  );
  const row = suggestions.getByRole('button', {
    name: `Use Timid spread 18 HP / 26 Def / 22 Spe`,
    exact: true,
  });
  await expect(row).toContainText('Copied team · M-C · 1 points moved');
  await expect(chipsOf(row)).toHaveText(['18 HP', '26 Def', '22 Spe']);

  await row.click();
  for (const [stat, value] of [
    ['HP', '18'],
    ['Atk', '0'],
    ['Def', '26'],
    ['SpA', '0'],
    ['SpD', '0'],
    ['Spe', '22'],
  ])
    await expect(editor.getByLabel(`${stat} EV`, { exact: true })).toHaveValue(
      value
    );
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await card.getByRole('button', { name: /Apply/ }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `${pokemon} changes applied and saved.` })
  ).toBeVisible();
  await page.reload();
  await card
    .getByRole('button', { name: `Edit ${pokemon} EVs`, exact: true })
    .click();
  const saved = page.getByRole('dialog', {
    name: `Edit ${pokemon} set`,
    exact: true,
  });
  await expect(saved.getByLabel('Def EV', { exact: true })).toHaveValue('26');
  await expect(saved.getByLabel('Spe EV', { exact: true })).toHaveValue('22');
});
