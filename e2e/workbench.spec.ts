import { expect, test } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

const peter = catalog.teams.find((team) => team.sheetIds.includes('MB809'))!;
const storageKey = 'champions-atlas:teams:v1';
const optionValue = (text: string) => text.replace(/\s?\d+\/\d+$/, '').trim();

test('save Peter, choose one slot, compare, edit, export, and preserve other five sets', async ({
  page,
}) => {
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
  await expect(weavile.locator('img[src*="/items/"]')).toBeVisible();
  await expect(
    weavile.getByText(originalWeavile.item!, { exact: true })
  ).toBeVisible();
  await expect(
    weavile.locator('p', { hasText: `Ability: ${originalWeavile.ability}` })
  ).toHaveText(`Ability: ${originalWeavile.ability}`);
  for (const move of originalWeavile.moves)
    await expect(weavile.getByText(move, { exact: true })).toBeVisible();
  await expect(weavile.locator('textarea')).toHaveCount(0);
  await expect(page.getByText('Original & source history')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Similar teams' })).toHaveCount(
    0
  );
  await weavile
    .getByRole('button', { name: 'Change Weavile', exact: true })
    .click();
  const pokemonEditor = page.getByRole('region', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expect(pokemonEditor).toBeVisible();
  const pokemonInput = pokemonEditor.getByLabel('Pokémon', { exact: true });
  await expect(pokemonInput).toBeVisible();
  const pokemonChoices = pokemonEditor
    .getByLabel('Pokémon suggestions')
    .getByRole('button');
  await expect(pokemonChoices.first()).toBeVisible();
  await pokemonEditor
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(pokemonEditor).toHaveCount(0);
  await page
    .getByLabel('Team name', { exact: true })
    .fill('My Weavile adaptation');
  await weavile
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  const itemEditor = page.getByRole('region', {
    name: 'Edit Weavile set',
    exact: true,
  });
  const item = itemEditor.getByLabel('Item', { exact: true });
  const initialItem = await item.inputValue();
  await expect(item).toBeVisible();
  await expect(itemEditor.getByLabel('Ability', { exact: true })).toHaveCount(
    0
  );
  await expect(itemEditor.getByLabel('Nature', { exact: true })).toHaveCount(0);
  await expect(itemEditor.getByLabel('EV editor')).toHaveCount(0);
  await expect(itemEditor.getByLabel('Selected moves')).toHaveCount(0);
  await expect(itemEditor.getByLabel('Showdown set text')).toHaveCount(0);
  const itemChoices = itemEditor
    .getByLabel('Item suggestions')
    .getByRole('button');
  const replacementItem = itemChoices
    .filter({ hasNotText: initialItem })
    .first();
  await expect(replacementItem).toBeVisible();
  const itemText = await replacementItem.textContent();
  await replacementItem.click();
  await itemEditor
    .getByRole('button', { name: 'Apply item', exact: true })
    .click();
  await expect(itemEditor).toHaveCount(0);
  await expect(weavile).toContainText(optionValue(itemText!));

  await weavile
    .getByRole('button', { name: 'Edit Weavile ability', exact: true })
    .click();
  const abilityEditor = page.getByRole('region', {
    name: 'Edit Weavile set',
    exact: true,
  });
  const ability = abilityEditor.getByLabel('Ability', { exact: true });
  const initialAbility = await ability.inputValue();
  await expect(abilityEditor.getByLabel('Item', { exact: true })).toHaveCount(
    0
  );
  await expect(abilityEditor.getByLabel('Nature', { exact: true })).toHaveCount(
    0
  );
  const abilityChoices = abilityEditor
    .getByLabel('Ability suggestions')
    .getByRole('button');
  const replacementAbility = abilityChoices
    .filter({ hasNotText: initialAbility })
    .first();
  await expect(replacementAbility).toBeVisible();
  const abilityText = await replacementAbility.textContent();
  await replacementAbility.click();
  await abilityEditor
    .getByRole('button', { name: 'Apply ability', exact: true })
    .click();
  await expect(abilityEditor).toHaveCount(0);
  await expect(weavile).toContainText(optionValue(abilityText!));

  await weavile
    .getByRole('button', { name: 'Edit Weavile moves', exact: true })
    .click();
  const movesEditor = page.getByRole('region', {
    name: 'Edit Weavile set',
    exact: true,
  });
  const moves = movesEditor.getByRole('list', { name: 'Selected moves' });
  const initialMoves = await moves.getByRole('listitem').allTextContents();
  expect(initialMoves).toHaveLength(4);
  await expect(movesEditor.getByLabel('Item', { exact: true })).toHaveCount(0);
  await expect(movesEditor.getByLabel('Ability', { exact: true })).toHaveCount(
    0
  );
  await expect(movesEditor.getByLabel('Nature', { exact: true })).toHaveCount(
    0
  );
  await expect(movesEditor.getByLabel('EV editor')).toHaveCount(0);
  await expect(movesEditor.getByLabel('Showdown set text')).toHaveCount(0);
  await movesEditor
    .getByRole('button', { name: 'Remove ' + initialMoves[0] })
    .click();
  const customMove = movesEditor.getByLabel('Custom move', { exact: true });
  await customMove.fill('Test Move');
  await movesEditor
    .getByRole('button', { name: 'Add move', exact: true })
    .click();
  await expect(moves).toContainText('Test Move');
  await movesEditor
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(movesEditor).toHaveCount(0);
  await expect(weavile).toContainText(initialMoves[0]);

  await weavile
    .getByRole('button', { name: 'Edit Weavile set text', exact: true })
    .click();
  const textEditor = page.getByRole('region', {
    name: 'Edit Weavile set',
    exact: true,
  });
  const set = textEditor.getByLabel('Showdown set text', { exact: true });
  await expect(set).toBeVisible();
  await expect(textEditor.getByLabel('Item', { exact: true })).toHaveCount(0);
  await expect(textEditor.getByLabel('Ability', { exact: true })).toHaveCount(
    0
  );
  await expect(textEditor.getByLabel('Nature', { exact: true })).toHaveCount(0);
  await expect(textEditor.getByLabel('EV editor')).toHaveCount(0);
  await expect(textEditor.getByLabel('Selected moves')).toHaveCount(0);
  const setText = await set.inputValue();
  expect(setText).not.toMatch(/(?:IVs|Level|Tera Type):/);
  await set.fill(`${setText}\n- Protect`);
  await textEditor
    .getByRole('button', { name: 'Apply set text', exact: true })
    .click();
  await expect(textEditor.getByRole('alert')).toContainText(
    'more than four moves'
  );
  expect(
    await page.evaluate((key) => {
      const team = JSON.parse(localStorage.getItem(key)!)[0];
      return team.members.find(
        (member: { pokemon: string }) => member.pokemon === 'Weavile'
      ).spread;
    }, storageKey)
  ).not.toBe('32 HP / 32 Atk / 2 Spe');
  await set.fill(setText.replace(/EVs: [^\n]+/, 'EVs: 32 HP / 32 Atk / 2 Spe'));
  await textEditor
    .getByRole('button', { name: 'Apply set text', exact: true })
    .click();
  await expect(textEditor).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Changes saved on this device.'
  );
  await page.reload();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    'My Weavile adaptation'
  );
  await expect(
    weavile.getByRole('button', { name: 'Change Weavile', exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Copy team text', exact: true })
    .click();
  await expect(page.getByLabel('Export text', { exact: true })).toHaveValue(
    /EVs: 32 HP \/ 32 Atk \/ 2 Spe/
  );
  await expect(page.getByLabel('Export text', { exact: true })).not.toHaveValue(
    /(?:IVs|Level|Tera Type):/
  );
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  expect(stored.original).toEqual(original);
  expect(
    stored.members.filter(
      (member: { pokemon: string }) => member.pokemon !== 'Weavile'
    )
  ).toEqual(
    original.members.filter(
      (member: { pokemon: string }) => member.pokemon !== 'Weavile'
    )
  );
  expect(stored.sources.length).toBe(1);
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

test('untouched legacy EV spread applies, but changed spread requires 66', async ({
  page,
}) => {
  await page.goto(`/teams/${peter.id}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toBeVisible();
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
  let editor = page.getByRole('region', { name: 'Edit Weavile set' });
  await editor.getByLabel('Item', { exact: true }).fill('Legacy custom item');
  await editor.getByRole('button', { name: 'Apply item', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(weavile).toContainText('Legacy custom item');

  await weavile
    .getByRole('button', { name: 'Edit Weavile EVs', exact: true })
    .click();
  editor = page.getByRole('region', { name: 'Edit Weavile set' });
  await editor.getByLabel('HP EV', { exact: true }).fill('31');
  await expect(editor.getByLabel('EV editor')).toContainText('31/66');
  await expect(
    editor.getByRole('button', { name: 'Apply evs', exact: true })
  ).toBeDisabled();
});
