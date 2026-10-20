import { expect, test, type Locator, type Page } from '@playwright/test';

const raichuTeamId = 'm-c-b2039b4436fb6729';
const raichuTeamName = "Danyul_YT's Raichu-Y Floette Team";
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

test('a same-nature answer saves immediately without Apply', async ({
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
  ).not.toBe(before);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  const savedMember = saved.members.find(
    (member: { pokemon: string }) => member.pokemon === 'Raichu-Mega-Y'
  );
  expect(savedMember.spread).toBe('30 HP / 32 Def / 4 Spe');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(card.getByRole('button', { name: /Apply|Discard/ })).toHaveCount(
    0
  );
});

test('the panel starts empty, keeps the dialog inside the viewport and discloses manual EVs', async ({
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

  const toggle = editor.locator('[data-ev-toggle]');
  const manual = toggle.locator('xpath=..');
  const sliders = editor.getByLabel('HP EV slider', { exact: true });
  const numberInput = editor.getByLabel('HP EV', { exact: true });
  await expect(toggle).toHaveText('Adjust EVs manually');
  await expect(manual).not.toHaveAttribute('open', '');
  await expect(sliders).toBeHidden();
  await expect(numberInput).toBeHidden();
  await expect(
    editor.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
  ).toBeVisible();
  await expect(
    suggestions.getByText('Suggested spreads', { exact: true })
  ).toBeVisible();
  await expect(
    suggestions.getByText('Speed tiers', { exact: true })
  ).toHaveCount(0);

  await toggle.focus();
  await toggle.press('Enter');
  await expect(manual).toHaveAttribute('open', '');
  await expect(sliders).toBeVisible();
  await toggle.press('Space');
  await expect(manual).not.toHaveAttribute('open', '');
  await toggle.click();
  await expect(manual).toHaveAttribute('open', '');
  await toggle.click();
  await expect(manual).not.toHaveAttribute('open', '');
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

test('catalog spreads fill the list when no saved team runs the Pokémon', async ({
  page,
}) => {
  const pokemon = 'Raichu-Mega-Y';
  const { editor } = await openEditor(
    page,
    raichuTeamId,
    raichuTeamName,
    pokemon
  );
  const suggestions = editor.getByRole('region', {
    name: 'EV spread suggestions',
  });
  const rows = suggestions.getByRole('button', {
    name: /^Use .+ spread .+$/,
  });
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText('Original team');
  const catalogRows = rows.filter({ hasText: 'catalog team' });
  await expect(catalogRows).toHaveCount(5);
  await expect(
    catalogRows.filter({ hasText: /Original team|My in-game set/ })
  ).toHaveCount(0);
  const labels = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label')!)
  );
  expect(new Set(labels).size).toBe(6);
  expect(labels.every((label) => label.startsWith('Use Timid spread '))).toBe(
    true
  );
  const row = catalogRows.first();
  await expect(row).toBeVisible();
  const chips = await chipsOf(row).allTextContents();
  await row.click();
  for (const chip of chips) {
    const [, value, stat] = /^(\d+) (\w+)$/.exec(chip)!;
    await expect(editor.getByLabel(`${stat} EV`, { exact: true })).toHaveValue(
      value
    );
  }
});
