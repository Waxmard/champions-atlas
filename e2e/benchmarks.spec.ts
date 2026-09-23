import { expect, test, type Page } from '@playwright/test';

const teamId = 'm-c-b2039b4436fb6729';
const teamName = "Danyul_YT's Raichu-Y Floette Team";
const pokemon = 'Raichu-Mega-Y';
const storageKey = 'champions-atlas:teams:v1';

async function openEditor(page: Page) {
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
  };
}

test('a generated spread stages first and saves only on Apply', async ({
  page,
}) => {
  await page.goto(`/teams/${teamId}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
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
  const suggestions = editor.getByRole('region', {
    name: 'EV spread suggestions',
  });
  await expect(editor.getByLabel('HP EV', { exact: true })).toHaveValue('18');
  await expect(editor.getByLabel('Def EV', { exact: true })).toHaveValue('25');
  await expect(
    editor.getByLabel('Spe EV slider', { exact: true })
  ).toBeVisible();
  await expect(
    editor.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
  ).toBeVisible();
  await expect(
    editor.getByRole('button', { name: 'Benchmark against the meta' })
  ).toHaveCount(0);
  await expect(editor.getByLabel('Battle form')).toHaveCount(0);
  await expect(editor.getByLabel('Search all species')).toHaveCount(0);
  await expect(
    editor.getByRole('heading', { name: 'EV benchmarks' })
  ).toHaveCount(0);
  await expect(suggestions).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000,
  });
  const option = suggestions.getByRole('button').first();
  await expect(option).toBeVisible();
  const chips = await option.locator('span.font-mono').allTextContents();
  const chosen = Object.fromEntries(
    chips.map((chip) => {
      const match = chip.trim().match(/^(\d+) (HP|Atk|Def|SpA|SpD|Spe)$/);
      expect(match, `spread chip: ${chip}`).not.toBeNull();
      return [match![2], match![1]];
    })
  );
  expect(chips.length).toBeGreaterThan(0);
  await option.click();
  for (const stat of ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'])
    await expect(editor.getByLabel(`${stat} EV`, { exact: true })).toHaveValue(
      chosen[stat] ?? '0'
    );
  await expect(
    editor.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
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
  await page.reload();
  await card
    .getByRole('button', { name: `Edit ${pokemon} EVs`, exact: true })
    .click();
  const saved = page.getByRole('dialog', {
    name: `Edit ${pokemon} set`,
    exact: true,
  });
  for (const stat of ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'])
    await expect(saved.getByLabel(`${stat} EV`, { exact: true })).toHaveValue(
      chosen[stat] ?? '0'
    );
  await expect(
    saved.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
  ).toBeVisible();
});

test('editing invalidates pending recommendations without moving input focus', async ({
  page,
}) => {
  const { editor, suggestions } = await openEditor(page);
  await expect(suggestions.getByRole('button').first()).toBeVisible({
    timeout: 30_000,
  });
  const input = editor.getByLabel('Def EV', { exact: true });
  await input.fill('26');
  await expect(input).toBeFocused();
  await expect(suggestions).toContainText('Updating suggestions…');
  await expect(suggestions.getByRole('button')).toHaveCount(0);
  await expect(suggestions).toContainText(
    'Complete a valid 66-point spread to see suggestions.'
  );
  await expect(suggestions.getByRole('button')).toHaveCount(0);
  await expect(input).toBeFocused();
  const speed = editor.getByLabel('Spe EV', { exact: true });
  await speed.fill('22');
  const scroller = editor.locator('.overflow-y-auto').first();
  const scrollBefore = await scroller.evaluate((element) => element.scrollTop);
  await expect(suggestions).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000,
  });
  await expect(suggestions.getByRole('button').first()).toBeVisible();
  await expect(speed).toBeFocused();
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(
    scrollBefore
  );
  page.once('dialog', (dialog) => dialog.dismiss());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test('Speed tiers stay a compact disclosure with normal scrolling', async ({
  page,
}) => {
  const { editor, suggestions } = await openEditor(page);
  await expect(suggestions).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000,
  });
  const details = suggestions.locator('details');
  const summary = details.locator('summary');
  await expect(details).not.toHaveAttribute('open', '');
  await summary.click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('Unmodified Speed');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  expect(
    await editor.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true);
  const scroller = editor.locator('.overflow-y-auto').first();
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(
    await scroller.evaluate((element) => element.scrollTop)
  ).toBeGreaterThan(0);
  await summary.click();
  await expect(details).not.toHaveAttribute('open', '');
});
