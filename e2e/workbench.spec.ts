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
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
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
  await item.fill('Staged custom item');
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
  const replacementText = (await replacement.textContent())!.trim();
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

  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(beforeStorage);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Set changes staged.');
  await expect(weavile).toContainText('Staged custom item');
  await expect(weavile).toContainText('Test Move');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(beforeStorage);

  await weavile.getByRole('button', { name: /Apply/ }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Weavile changes applied and saved.'
  );
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
  await weavile.getByRole('button', { name: /Apply/ }).click();
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

test('untouched legacy EV spread applies, but changed spread requires 66', async ({
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
  const replacementText = (await replacement.textContent())!.trim();
  await replacement.click();
  await expect(moveInputs[0]).toHaveValue(replacementText);
  await editor
    .getByRole('button', { name: 'Clear move 2', exact: true })
    .click();
  await moveInputs[1].fill('Custom move');
  await moveInputs[1].press('Enter');
  await expect(moveInputs[1]).toHaveValue('Custom move');
  page.once('dialog', (dialog) => dialog.accept());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(weavile).toContainText(initialMoves[0]);

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
  await expect(sneasler.getByRole('button', { name: /Apply/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear selected Pokémon' }).click();
  await expect(sneasler).toBeVisible();
  await sneasler.getByRole('button', { name: /Apply/ }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Sneasler changes applied and saved.'
  );
});

test('Change searches beyond the first five and stages the published set', async ({
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
  await expect(editor).toHaveCount(0);
  const raichu = page.getByRole('region', { name: 'Raichu set' });
  await expect(raichu).toContainText('Shuca Berry');
  await expect(raichu).toContainText('Lightning Rod');
  await expect(raichu).toContainText('Electroweb');
  await expect(raichu.getByRole('button', { name: /Apply/ })).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(beforeStorage);
  await raichu.getByRole('button', { name: /Discard/ }).click();
  await expect(page.getByRole('region', { name: 'Weavile set' })).toBeVisible();
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
  const chosen = (await first.textContent())!.trim();
  await item.press('Tab');
  await expect(first).toBeFocused();
  await first.press('Enter');
  await expect(item).toHaveValue(chosen);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await weavile.getByRole('button', { name: /Apply/ }).click();
  await page.reload();
  await expect(weavile.getByText(chosen, { exact: true })).toBeVisible();
});

test('custom ability typed value survives Escape and Cancel', async ({
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
  await weavile.getByRole('button', { name: /Apply/ }).click();
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
  page.once('dialog', (dialog) => dialog.accept());
  await reopened.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    weavile
      .getByRole('button', { name: 'Edit Weavile ability', exact: true })
      .getByText('Glitch Drive', { exact: true })
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
  const chosen = (await options.first().textContent())!.trim();
  await move1.press('Tab');
  await expect(options.first()).toBeFocused();
  await options.first().press('Enter');
  await expect(move1).toHaveValue(chosen);
  page.once('dialog', (dialog) => dialog.accept());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
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

test('footer Cancel warns before discarding staged edits', async ({ page }) => {
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
  const item = editor.getByLabel('Item', { exact: true });
  await item.fill('Choice Band');
  const itemSuggestions = editor.getByLabel('Item suggestions', {
    exact: true,
  });
  await expect(itemSuggestions).toBeVisible();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(itemSuggestions).toHaveCount(0);

  page.once('dialog', (dialog) => dialog.dismiss());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(item).toHaveValue('Choice Band');

  page.once('dialog', (dialog) => dialog.accept());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
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
