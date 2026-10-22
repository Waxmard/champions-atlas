import { expect, test, type Locator, type Page } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };
import {
  expectDetailsSubView,
  expectMovesSubView,
  missing,
  openWorkbench,
  peter,
} from './workbench-helpers';

async function chooseOption(page: Page, picker: Locator, name: string) {
  await expect(async () => {
    await picker.fill(name);
    await expect(page.getByRole('option', { name, exact: true })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await picker.press('ArrowDown');
  await picker.press('Enter');
}

const storageKey = 'champions-atlas:teams:v1';
const raichuTeam =
  catalog.teams.find((team) =>
    team.members.some((member) => member.pokemon === 'Raichu-Mega-Y')
  ) ?? missing('Raichu-Mega-Y team');

async function expectOverviewHub(editor: Locator) {
  for (const name of [
    'Change Pokémon',
    'Edit item, ability, and nature',
    'Edit moves',
    'Edit EV spread',
  ]) {
    await expect(
      editor.getByRole('button', { name, exact: true })
    ).toBeVisible();
  }
}

async function expectPokemonSubView(editor: Locator) {
  await expect(
    editor.getByRole('textbox', { name: 'Pokémon', exact: true })
  ).toBeVisible();
}

test('save Peter, choose one slot, compare, edit, export, and preserve other five sets', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkbench(page);
  const workbenchUrl = page.url();
  const original = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('no saved teams');
    return JSON.parse(raw)[0].original;
  }, storageKey);
  expect(original.paste).toMatch(/Level:/);
  expect(
    original.members.every((member: { spread: string }) => !!member.spread)
  ).toBe(true);

  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  const originalWeavile = peter.members.find(
    (member) => member.pokemon === 'Weavile'
  );
  if (!originalWeavile?.item || !originalWeavile.ability)
    throw new Error('peter is missing the Weavile set');
  const beforeStorage = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey
  );
  await expect(weavile.locator('[data-item-icon]')).toBeVisible();
  await expect(
    weavile.getByText(originalWeavile.item, { exact: true })
  ).toBeVisible();
  await expect(
    weavile
      .getByRole('button', { name: 'Edit Weavile ability', exact: true })
      .getByText(originalWeavile.ability, { exact: true })
  ).toBeVisible();
  for (const move of originalWeavile.moves)
    await expect(weavile.getByText(move, { exact: true })).toBeVisible();

  await weavile
    .getByRole('button', { name: 'Change Weavile', exact: true })
    .click();
  let editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expectPokemonSubView(editor);
  const pokemonChoices = editor
    .getByLabel('Pokémon suggestions', { exact: true })
    .getByRole('button');
  await expect(pokemonChoices).toHaveCount(5);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);

  await weavile
    .getByRole('button', { name: 'Edit set for Weavile', exact: true })
    .click();
  editor = page.getByRole('dialog', { name: 'Edit Weavile set', exact: true });
  await expectOverviewHub(editor);
  await editor
    .getByRole('button', {
      name: 'Edit item, ability, and nature',
      exact: true,
    })
    .click();
  await expectDetailsSubView(editor);
  const item = editor.getByLabel('Item', { exact: true });
  await item.fill('Custom saved item');
  await item.press('Escape');
  await editor.getByLabel('Nature', { exact: true }).selectOption('Timid');

  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await expectOverviewHub(editor);
  await editor.getByRole('button', { name: 'Edit moves', exact: true }).click();
  await expectMovesSubView(editor);
  const initialMoves = await Promise.all(
    [1, 2, 3, 4].map((slot) =>
      editor.getByLabel('Move ' + slot, { exact: true }).inputValue()
    )
  );

  const move2 = editor.getByLabel('Move 2', { exact: true });
  await move2.fill('Test Move');
  await move2.press('Enter');
  await expect(move2).toHaveValue('Test Move');
  const move1 = editor.getByLabel('Move 1', { exact: true });
  await move1.fill('ice');
  const moveSuggestions = editor.getByLabel('Move suggestions', {
    exact: true,
  });
  const replacement = moveSuggestions
    .getByRole('button')
    .filter({ hasNotText: initialMoves[0] })
    .first();
  await expect(replacement).toBeVisible();
  const replacementRaw = await replacement.textContent();
  if (!replacementRaw) throw new Error('suggestion has no text');
  const replacementText = replacementRaw.replace(/Original/g, '').trim();
  await replacement.click();
  await expect(move1).toHaveValue(replacementText);

  const move3 = editor.getByLabel('Move 3', { exact: true });
  await editor
    .getByRole('button', { name: 'Clear move 3', exact: true })
    .click();
  await expect(move3).toHaveValue('');
  await expect(
    editor.getByRole('button', { name: 'Clear move 3', exact: true })
  ).toBeDisabled();
  await move3.fill('Refilled Move');
  await move3.press('Enter');
  await expect(move3).toHaveValue('Refilled Move');

  const autosaved = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('no saved teams');
    return JSON.parse(raw)[0];
  }, storageKey);
  expect(
    autosaved.members.find(
      (member: { pokemon: string }) => member.pokemon === 'Weavile'
    ).item
  ).toBe('Custom saved item');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).not.toBe(beforeStorage);
  await expect(page.getByRole('button', { name: /Apply|Discard/ })).toHaveCount(
    0
  );
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(weavile).toContainText('Custom saved item');
  await expect(weavile).toContainText('Test Move');
  const storedAfterSave = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('no saved teams');
    return JSON.parse(raw)[0];
  }, storageKey);
  expect(storedAfterSave.original).toEqual(original);
  expect(
    storedAfterSave.members.filter(
      (member: { pokemon: string }) => member.pokemon !== 'Weavile'
    )
  ).toEqual(
    original.members.filter(
      (member: { pokemon: string }) => member.pokemon !== 'Weavile'
    )
  );

  await weavile
    .getByRole('button', { name: 'Edit set for Weavile', exact: true })
    .click();
  editor = page.getByRole('dialog', { name: 'Edit Weavile set', exact: true });
  await editor
    .getByRole('button', { name: 'Edit Showdown text', exact: true })
    .click();
  const raw = editor.getByRole('textbox', {
    name: 'Showdown set text',
    exact: true,
  });
  const rawValue = await raw.inputValue();
  await raw.fill(rawValue + '\n- Protect');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor.locator('[role="alert"]:not(:empty)')).toContainText(
    'more than four moves'
  );
  await expect(editor).toBeVisible();
  await raw.fill(
    rawValue.replace(/EVs: [^\n]+/, 'EVs: 32 HP / 32 Atk / 2 Spe')
  );
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    peter.name
  );
  await page
    .getByRole('button', { name: 'Copy team text', exact: true })
    .click();
  await expect(page.getByLabel('Export text', { exact: true })).toHaveValue(
    /EVs: 32 HP \/ 32 Atk \/ 2 Spe/
  );
  expect(errors).toEqual([]);
  await page.goto('/');
  await page.goto(workbenchUrl);
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    peter.name
  );
});

test('direct move slots and species swap on a saved team', async ({ page }) => {
  await openWorkbench(page);
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit Weavile moves', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expectMovesSubView(editor);
  const moveInputs = [1, 2, 3, 4].map((slot) =>
    editor.getByLabel('Move ' + slot, { exact: true })
  );
  const initialMoves = await Promise.all(
    moveInputs.map((input) => input.inputValue())
  );
  const move1Suggestions = editor.getByLabel('Move suggestions', {
    exact: true,
  });
  await moveInputs[0].fill('ice');
  const replacement = move1Suggestions
    .getByRole('button')
    .filter({ hasNotText: initialMoves[0] })
    .first();
  const replacementRaw = await replacement.textContent();
  if (!replacementRaw) throw new Error('suggestion has no text');
  const replacementText = replacementRaw.replace(/Original/g, '').trim();
  await replacement.click();
  await expect(moveInputs[0]).toHaveValue(replacementText);
  await editor
    .getByRole('button', { name: 'Clear move 2', exact: true })
    .click();
  await moveInputs[1].fill('Custom move');
  await moveInputs[1].press('Enter');
  await expect(moveInputs[1]).toHaveValue('Custom move');
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(weavile).toContainText(replacementText);
  await expect(weavile).toContainText('Custom move');

  await page
    .getByRole('button', { name: 'Change a Pokémon', exact: true })
    .click();
  const picker = page.getByRole('combobox', {
    name: 'Change a Pokémon',
    exact: true,
  });
  await chooseOption(page, picker, 'Sneasler');
  await expect(
    page.getByText('Sneasler', { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Sneasler set', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Glimmora-Mega set', exact: true })
  ).toHaveCount(0);
  const sneasler = page.getByRole('region', {
    name: 'Sneasler set',
    exact: true,
  });
  await expect(
    sneasler.getByRole('button', { name: /Apply|Discard/ })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear selected Pokémon' }).click();
  await expect(sneasler).toBeVisible();
  const swapped = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('no saved teams');
    return JSON.parse(raw)[0];
  }, storageKey);
  expect(
    swapped.members.some(
      (member: { pokemon: string }) => member.pokemon === 'Sneasler'
    )
  ).toBe(true);
});

test('Change searches beyond the first five and saves the published set', async ({
  page,
}) => {
  await openWorkbench(page);
  const beforeStorage = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey
  );
  await page
    .getByRole('button', { name: 'Change Weavile', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expect(
    editor.getByLabel('Pokémon suggestions').getByRole('button')
  ).toHaveCount(5);
  await editor.getByRole('textbox', { name: 'Pokémon' }).fill('Raichu');
  await editor.getByRole('button', { name: 'Use Raichu set' }).click();
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const raichu = page.getByRole('region', { name: 'Raichu set' });
  await expect(raichu).toContainText('Shuca Berry');
  await expect(raichu).toContainText('Lightning Rod');
  await expect(raichu).toContainText('Electroweb');
  await expect(
    raichu.getByRole('button', { name: /Apply|Discard/ })
  ).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).not.toBe(beforeStorage);
  await page.reload();
  await expect(raichu).toContainText('Lightning Rod');
});

test('page swap reports no overlap and clears its selection', async ({
  page,
}) => {
  await openWorkbench(page);
  await page
    .getByRole('button', { name: 'Change a Pokémon', exact: true })
    .click();
  const swapPicker = page.getByRole('combobox', {
    name: 'Change a Pokémon',
    exact: true,
  });
  await chooseOption(page, swapPicker, 'Medicham');
  const noOverlap = page.getByText(
    'No catalog team with Medicham shares a remaining teammate.',
    { exact: true }
  );
  await expect(noOverlap).toBeVisible();
  await page.getByRole('button', { name: 'Clear selected Pokémon' }).click();
  await expect(noOverlap).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Weavile set' })).toBeVisible();
});

test('manual EV disclosure stays within the viewport and supports keyboard and touch', async ({
  page,
}) => {
  await page.goto(`/teams/${raichuTeam.id}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    raichuTeam.name
  );
  const card = page.getByRole('region', {
    name: 'Raichu-Mega-Y set',
    exact: true,
  });
  await card
    .getByRole('button', { name: 'Edit Raichu-Mega-Y EVs', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Raichu-Mega-Y set',
    exact: true,
  });
  const suggestions = editor.getByRole('region', {
    name: 'EV spread suggestions',
  });
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
  expect(
    await editor.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true);
});

test('catalog spreads expand in ranked batches and autosave a newly revealed spread', async ({
  page,
}) => {
  await page.goto(`/teams/${raichuTeam.id}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    raichuTeam.name
  );
  const card = page.getByRole('region', {
    name: 'Raichu-Mega-Y set',
    exact: true,
  });
  await card
    .getByRole('button', { name: 'Edit Raichu-Mega-Y EVs', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Raichu-Mega-Y set',
    exact: true,
  });
  const suggestions = editor.getByRole('region', {
    name: 'EV spread suggestions',
  });
  const rows = suggestions.getByRole('button', {
    name: /^Use Timid spread .+$/,
  });
  const catalogRows = rows
    .filter({ hasText: 'catalog team' })
    .filter({ hasNotText: /Original team|My in-game set/ });
  const spreadKeys = async (list: Locator) =>
    Promise.all(
      (await list.all()).map(async (row) =>
        (await row.locator('span.font-mono').allTextContents()).join(' / ')
      )
    );
  const storageBeforeExpansion = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey
  );

  const showMore = suggestions.getByRole('button', {
    name: 'Show more',
    exact: true,
  });
  await expect(showMore).toBeVisible();
  const batch = 5;
  const initialCatalogCount = await catalogRows.count();
  expect(initialCatalogCount).toBeGreaterThan(0);
  expect(initialCatalogCount).toBeLessThanOrEqual(batch);
  await expect(rows).toHaveCount(initialCatalogCount + 1);
  await expect(rows.first()).toContainText('Original team');
  const initialRows = await spreadKeys(rows);

  await showMore.click();
  await expect(async () => {
    expect(await catalogRows.count()).toBeGreaterThan(initialCatalogCount);
  }).toPass();
  const firstExpandedRows = await spreadKeys(rows);
  expect(firstExpandedRows.slice(0, initialRows.length)).toEqual(initialRows);
  const firstAddedCount = (await catalogRows.count()) - initialCatalogCount;
  expect(firstAddedCount).toBeLessThanOrEqual(batch);
  const newlyRevealedRow = catalogRows.nth(initialCatalogCount);
  const newlyRevealedSpread = await newlyRevealedRow
    .locator('span.font-mono')
    .allTextContents();

  let previousRows = firstExpandedRows;
  let previousCatalogCount = await catalogRows.count();
  while (await showMore.count()) {
    await showMore.click();
    await expect(async () => {
      expect(await catalogRows.count()).toBeGreaterThan(previousCatalogCount);
    }).toPass();
    const currentCatalogCount = await catalogRows.count();
    expect(currentCatalogCount - previousCatalogCount).toBeLessThanOrEqual(
      batch
    );
    const currentRows = await spreadKeys(rows);
    expect(currentRows.slice(0, previousRows.length)).toEqual(previousRows);
    expect(new Set(currentRows).size).toBe(currentRows.length);
    previousRows = currentRows;
    previousCatalogCount = currentCatalogCount;
  }
  expect(new Set(previousRows).size).toBe(previousRows.length);
  await expect(showMore).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(storageBeforeExpansion);
  await expect(newlyRevealedRow).toBeVisible();

  await newlyRevealedRow.click();
  for (const chip of newlyRevealedSpread) {
    const match = /^(\d+) (\w+)$/.exec(chip);
    if (!match) throw new Error('unparsable spread chip ' + chip);
    const [, value, stat] = match;
    await expect(editor.getByLabel(`${stat} EV`, { exact: true })).toHaveValue(
      value
    );
  }
  const storedAfterSelection = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('no saved teams');
    return JSON.parse(raw)[0];
  }, storageKey);
  const savedMember = storedAfterSelection.members.find(
    (member: { pokemon: string }) => member.pokemon === 'Raichu-Mega-Y'
  );
  expect(savedMember.spread).toBe(newlyRevealedSpread.join(' / '));
  expect(savedMember.nature).toBe('Timid');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).not.toBe(storageBeforeExpansion);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
});

test('nature chips on the EV page set the nature and mark affected stats', async ({
  page,
}) => {
  await openWorkbench(page);
  const whimsicott = page.getByRole('region', {
    name: 'Whimsicott set',
    exact: true,
  });
  await whimsicott
    .getByRole('button', { name: 'Edit Whimsicott EVs', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Whimsicott set',
    exact: true,
  });
  const manualToggle = editor.locator('[data-ev-toggle]');
  await expect(manualToggle).toBeFocused();
  await manualToggle.click();
  await expect(editor.getByLabel('HP EV', { exact: true })).toBeVisible();
  await expect(
    editor.getByText('Current: Timid (+Spe / -Atk)', { exact: true })
  ).toBeVisible();

  const bold = editor.getByRole('button', {
    name: 'Use Bold nature',
    exact: true,
  });
  await expect(bold).toBeVisible();
  await bold.click();
  await expect(
    editor.getByText('Current: Bold (+Def / -Atk)', { exact: true })
  ).toBeVisible();
  await expect(editor.getByTitle('Bold raises Def by 10%')).toBeVisible();
  await expect(editor.getByTitle('Bold lowers Atk by 10%')).toBeVisible();
  await expect(editor.getByTitle('Timid raises Spe by 10%')).toHaveCount(0);
  await expect(editor.getByText('+10%', { exact: true })).toBeVisible();
  await expect(editor.getByText('-10%', { exact: true })).toBeVisible();
  const spreadChoices = editor
    .getByRole('region', { name: 'EV spread suggestions' })
    .getByRole('button', { name: /^Use .* spread / });
  const displayedChoices = await spreadChoices.all();
  expect(displayedChoices.length).toBeGreaterThan(0);
  for (const choice of displayedChoices)
    await expect(choice).toHaveAttribute('aria-label', /^Use Bold spread /);

  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    whimsicott.getByRole('button', {
      name: 'Edit Whimsicott nature',
      exact: true,
    })
  ).toContainText('Bold');
});
test('footer Close warns only before discarding invalid input and keeps prior autosaves', async ({
  page,
}) => {
  await openWorkbench(page);
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await editor.getByLabel('Item', { exact: true }).fill('Choice Band');
  await editor.getByLabel('Item', { exact: true }).press('Enter');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor.getByRole('button', { name: 'Edit moves', exact: true }).click();
  const duplicate = await editor
    .getByLabel('Move 1', { exact: true })
    .inputValue();
  await editor.getByLabel('Move 2', { exact: true }).fill(duplicate);
  let confirmations = 0;
  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Discard unsaved input?');
    if (confirmations++ === 0) await dialog.dismiss();
    else await dialog.accept();
  });
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  expect(confirmations).toBe(1);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Move 2', { exact: true })).toHaveValue(
    duplicate
  );
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  expect(confirmations).toBe(2);
  await expect(editor).toHaveCount(0);
  await expect(weavile.getByText('Choice Band', { exact: true })).toBeVisible();
  await page.reload();
  await expect(weavile.getByText('Choice Band', { exact: true })).toBeVisible();
});
test('structured edits survive a trip through the Showdown text view', async ({
  page,
}) => {
  await openWorkbench(page);
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit set for Weavile', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await editor
    .getByRole('button', { name: 'Edit Showdown text', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor
    .getByRole('button', {
      name: 'Edit item, ability, and nature',
      exact: true,
    })
    .click();
  await editor.getByLabel('Item', { exact: true }).fill('Choice Band');
  await editor.getByLabel('Item', { exact: true }).press('Enter');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Use original set', exact: true })
    .click();
  await expect(editor).toBeVisible();
  await editor
    .getByRole('button', {
      name: 'Edit item, ability, and nature',
      exact: true,
    })
    .click();
  await editor.getByLabel('Item', { exact: true }).fill('Choice Band');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(weavile.getByText('Choice Band', { exact: true })).toBeVisible();
});
for (const mutation of ['changed', 'deleted'] as const) {
  test(
    'mounted editor refuses an externally ' + mutation + ' team',
    async ({ page }) => {
      await openWorkbench(page);
      await page
        .getByRole('button', { name: 'Edit Weavile item', exact: true })
        .click();
      const editor = page.getByRole('dialog', {
        name: 'Edit Weavile set',
        exact: true,
      });
      await page.evaluate(
        ({ key, mutation }) => {
          const raw = localStorage.getItem(key);
          if (!raw) throw new Error('no saved teams');
          const teams = JSON.parse(raw);
          if (mutation === 'deleted') teams.splice(0, 1);
          else teams[0].name = 'Changed elsewhere';
          localStorage.setItem(key, JSON.stringify(teams));
        },
        { key: storageKey, mutation }
      );
      const external = await page.evaluate(
        (key) => localStorage.getItem(key),
        storageKey
      );
      await editor.getByLabel('Item', { exact: true }).fill('Uncommitted item');
      await editor.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(editor).toBeVisible();
      await expect(editor.getByLabel('Item', { exact: true })).toHaveValue(
        'Uncommitted item'
      );
      await expect(editor.locator('[role="alert"]:not(:empty)')).toContainText(
        'Could not save this input'
      );
      expect(
        await page.evaluate((key) => localStorage.getItem(key), storageKey)
      ).toBe(external);
      page.once('dialog', (dialog) => dialog.accept());
      await editor.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(editor).toHaveCount(0);
      if (mutation === 'changed')
        await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
          'Changed elsewhere'
        );
      else
        await expect(
          page.getByText('No saved teams yet.', { exact: false })
        ).toBeVisible();
    }
  );
}

test('pagehide flushes active editor input while preserving failed pending name', async ({
  page,
}) => {
  await openWorkbench(page);
  const name = page.getByLabel('Team name', { exact: true });
  await name.fill('');
  await page
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await editor.getByLabel('Item', { exact: true }).fill('Pagehide item');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const stored = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('no saved teams');
    return JSON.parse(raw)[0];
  }, storageKey);
  expect(stored.name).toBe(peter.name);
  expect(
    stored.members.find(
      (member: { pokemon: string }) => member.pokemon === 'Weavile'
    ).item
  ).toBe('Pagehide item');
  await expect(name).toHaveValue('');
  await expect(editor.getByLabel('Item', { exact: true })).toHaveValue(
    'Pagehide item'
  );
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
});
