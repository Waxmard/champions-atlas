import { expect, test, type Locator, type Page } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

const peter = catalog.teams.find((team) => team.sheetIds.includes('MB809'))!;
const storageKey = 'champions-atlas:teams:v1';

async function expectOverviewHub(editor: Locator) {
  await expect(
    editor.getByRole('button', { name: 'Change Pokémon', exact: true })
  ).toBeVisible();
  await expect(
    editor.getByRole('button', {
      name: 'Edit item, ability, and nature',
      exact: true,
    })
  ).toBeVisible();
  await expect(
    editor.getByRole('button', { name: 'Edit moves', exact: true })
  ).toBeVisible();
  await expect(
    editor.getByRole('button', { name: 'Edit EV spread', exact: true })
  ).toBeVisible();
}
async function expectMovesSubView(editor: Locator) {
  for (const slot of [1, 2, 3, 4]) {
    await expect(
      editor.getByLabel(`Move ${slot}`, { exact: true })
    ).toBeVisible();
  }
}
async function expectDetailsSubView(editor: Locator) {
  await expect(editor.getByLabel('Item', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Ability', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Nature', { exact: true })).toBeVisible();
}

async function expectPokemonSubView(editor: Locator) {
  await expect(
    editor.getByRole('textbox', { name: 'Pokémon', exact: true })
  ).toBeVisible();
}

async function expectSpreadSubView(editor: Locator) {
  await expect(editor.getByLabel('HP EV', { exact: true })).toBeVisible();
}

async function openWorkbench(page: Page) {
  await page.goto('/teams/' + peter.id);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    peter.name
  );
}

test('save Peter, choose one slot, compare, edit, export, and preserve other five sets', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWorkbench(page);
  const workbenchUrl = page.url();
  const original = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0].original,
    storageKey
  );
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
  )!;
  const beforeStorage = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey
  );
  await expect(weavile.locator('img[src*="/items/"]')).toBeVisible();
  await expect(
    weavile.getByText(originalWeavile.item!, { exact: true })
  ).toBeVisible();
  await expect(
    weavile
      .getByRole('button', { name: 'Edit Weavile ability', exact: true })
      .getByText(originalWeavile.ability!, { exact: true })
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
    .getByRole('button', { name: 'Edit Weavile set', exact: true })
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
  const replacementText = (await replacement.textContent())!
    .replace(/Original/g, '')
    .trim();
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

  const autosaved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  expect(
    autosaved.members.find(
      (member: { pokemon: string }) => member.pokemon === 'Weavile'
    ).item
  ).toBe('Custom saved item');
  expect(autosaved.history).toHaveLength(1);
  expect(autosaved.history[0].members).toEqual(original.members);
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
  const storedAfterSave = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
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
    .getByRole('button', { name: 'Edit Weavile set text', exact: true })
    .click();
  editor = page.getByRole('dialog', { name: 'Edit Weavile set', exact: true });
  const raw = editor.getByRole('textbox', {
    name: 'Showdown set text',
    exact: true,
  });
  const rawValue = await raw.inputValue();
  await raw.fill(rawValue + '\n- Protect');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('more than four moves');
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

test('untouched legacy EV spread saves, but changed spread requires 66', async ({
  page,
}) => {
  await openWorkbench(page);
  await page.evaluate((key) => {
    const teams = JSON.parse(localStorage.getItem(key)!);
    const member = teams[0].members.find(
      ({ pokemon }: { pokemon: string }) => pokemon === 'Weavile'
    );
    member.spread = '32 HP';
    delete member.set;
    localStorage.setItem(key, JSON.stringify(teams));
  }, storageKey);
  await page.reload();
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  let editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expectDetailsSubView(editor);
  await editor.getByLabel('Item', { exact: true }).fill('Legacy custom item');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(weavile).toContainText('Legacy custom item');

  await weavile
    .getByRole('button', { name: 'Edit Weavile EVs', exact: true })
    .click();
  editor = page.getByRole('dialog', { name: 'Edit Weavile set', exact: true });
  await expectSpreadSubView(editor);
  await editor.getByLabel('HP EV', { exact: true }).fill('31');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('must total 66');
  await expect(editor).toBeVisible();
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
  const replacementText = (await replacement.textContent())!
    .replace(/Original/g, '')
    .trim();
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
  await picker.fill('Sneasler');
  await page.getByRole('option', { name: 'Sneasler', exact: true }).click();
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
  const swapped = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  expect(
    swapped.members.some(
      (member: { pokemon: string }) => member.pokemon === 'Sneasler'
    )
  ).toBe(true);
  expect(swapped.history.at(-1).label).toBe('Changed Pokémon');
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
  await page
    .getByRole('combobox', { name: 'Change a Pokémon' })
    .fill('Medicham');
  await page.getByRole('option', { name: 'Medicham', exact: true }).click();
  const noOverlap = page.getByText(
    'No catalog team with Medicham shares a remaining teammate.',
    { exact: true }
  );
  await expect(noOverlap).toBeVisible();
  await page.getByRole('button', { name: 'Clear selected Pokémon' }).click();
  await expect(noOverlap).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Weavile set' })).toBeVisible();
});

test('item suggestions support Tab and Enter selection through save and reload', async ({
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
  await expectDetailsSubView(editor);
  const item = editor.getByLabel('Item', { exact: true });
  await item.fill('a');
  const suggestions = editor.getByLabel('Item suggestions', { exact: true });
  const first = suggestions.getByRole('button').first();
  await expect(first).toBeVisible();
  const chosen = (await first.textContent())!.replace(/Original/g, '').trim();
  await item.press('Tab');
  await expect(first).toBeFocused();
  await first.press('Enter');
  await expect(item).toHaveValue(chosen);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expect(weavile.getByText(chosen, { exact: true })).toBeVisible();
});

test('custom ability typed value survives Escape and Close saves valid input', async ({
  page,
}) => {
  await openWorkbench(page);
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit Weavile ability', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expectDetailsSubView(editor);
  const ability = editor.getByLabel('Ability', { exact: true });
  await ability.fill('Glitch Drive');
  await ability.press('Escape');
  await expect(ability).toHaveValue('Glitch Drive');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    weavile
      .getByRole('button', { name: 'Edit Weavile ability', exact: true })
      .getByText('Glitch Drive', { exact: true })
  ).toBeVisible();

  await weavile
    .getByRole('button', { name: 'Edit Weavile ability', exact: true })
    .click();
  const reopened = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expectDetailsSubView(reopened);
  await reopened.getByLabel('Ability', { exact: true }).fill('Another');
  await reopened.getByLabel('Ability', { exact: true }).press('Escape');
  await reopened.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    weavile
      .getByRole('button', { name: 'Edit Weavile ability', exact: true })
      .getByText('Another', { exact: true })
  ).toBeVisible();
});

test('move Enter preserves typed value and Tab Enter selects an exact suggestion', async ({
  page,
}) => {
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

  const move2 = editor.getByLabel('Move 2', { exact: true });
  await move2.fill('Pro');
  await move2.press('Enter');
  await expect(move2).toHaveValue('Pro');
  await expect(editor).toBeVisible();

  const move1 = editor.getByLabel('Move 1', { exact: true });
  await move1.fill('Ice');
  const options = editor
    .getByLabel('Move suggestions', { exact: true })
    .getByRole('button');
  await expect(options.first()).toBeVisible();
  const chosen = (await options.first().textContent())!
    .replace(/Original/g, '')
    .trim();
  await move1.press('Tab');
  await expect(options.first()).toBeFocused();
  await options.first().press('Enter');
  await expect(move1).toHaveValue(chosen);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
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
    .getByRole('button', { name: 'Edit Weavile set text', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
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
  const restored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  expect(
    restored.history.map((revision: { label: string }) => revision.label)
  ).toEqual(['Edited Weavile', 'Restored Weavile']);
  expect(
    restored.history[1].members.find(
      (member: { pokemon: string }) => member.pokemon === 'Weavile'
    ).item
  ).toBe('Choice Band');
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
test('leaving the Showdown text view untouched keeps the original set', async ({
  page,
}) => {
  await openWorkbench(page);
  const glimmora = page.getByRole('region', {
    name: 'Glimmora-Mega set',
    exact: true,
  });
  await glimmora
    .getByRole('button', { name: 'Edit Glimmora-Mega set text', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Glimmora-Mega set',
    exact: true,
  });
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await expect(editor.getByText('Unsaved edits', { exact: true })).toHaveCount(
    0
  );
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(glimmora).toBeVisible();
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
          const teams = JSON.parse(localStorage.getItem(key)!);
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
      await expect(editor.getByRole('alert')).toContainText(
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
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  expect(stored.name).toBe(peter.name);
  expect(
    stored.members.find(
      (member: { pokemon: string }) => member.pokemon === 'Weavile'
    ).item
  ).toBe('Pagehide item');
  expect(stored.history).toHaveLength(1);
  await expect(name).toHaveValue('');
  await expect(editor.getByLabel('Item', { exact: true })).toHaveValue(
    'Pagehide item'
  );
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
});
