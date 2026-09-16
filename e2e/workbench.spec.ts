import { expect, test } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

const peter = catalog.teams.find((team) => team.sheetIds.includes('MB809'))!;
const storageKey = 'champions-atlas:teams:v1';
const optionValue = (text: string) => text.replace(/\s?\d+\/\d+$/, '').trim();

test('save Peter, choose one slot, compare, edit, export, and preserve other five sets', async ({
  page,
}, testInfo) => {
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
  const history = page.getByText('Original & source history').locator('..');
  await history.locator('summary').click();
  await expect(history.locator('pre')).not.toContainText('Level:');
  await expect(history.locator('pre')).not.toContainText('Tera Type:');
  await expect(history.locator('pre')).not.toContainText('IVs:');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByLabel('Candidate regulation')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^Change /, pressed: true })
  ).toHaveCount(0);
  const defaultRecommendations = page
    .getByRole('region', { name: 'Similar teams', exact: true })
    .getByRole('article');
  await expect(defaultRecommendations.first()).toBeVisible();
  await defaultRecommendations
    .first()
    .getByRole('button', { name: /^Compare / })
    .click();
  await expect(
    page.getByRole('button', { name: 'Use replacement', exact: true })
  ).toHaveCount(0);
  await weavile
    .getByRole('button', { name: 'Change Weavile', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Change Sinistcha', exact: true })
    .click();
  await expect(
    weavile.getByRole('button', { name: 'Change Weavile', exact: true })
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.getByRole('button', { name: /^Change /, pressed: true })
  ).toHaveCount(1);
  await weavile
    .getByRole('button', { name: 'Change Weavile', exact: true })
    .click();
  await weavile
    .getByRole('button', { name: 'Change Weavile', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: /^Change /, pressed: true })
  ).toHaveCount(0);
  await weavile
    .getByRole('button', { name: 'Change Weavile', exact: true })
    .click();
  const alternatives = page
    .getByRole('region', { name: 'Similar teams', exact: true })
    .getByRole('article');
  await page
    .getByRole('region', { name: 'Your team', exact: true })
    .screenshot({ path: testInfo.outputPath('single-slot-controls.png') });
  await expect(alternatives.first()).toBeVisible();
  await expect(
    alternatives.first().locator('img[src*="/items/"]')
  ).toBeVisible();
  await alternatives
    .getByRole('button', { name: 'Compare Weavile', exact: true })
    .first()
    .click();
  const comparison = page.getByRole('region', { name: 'Selected comparison' });
  await expect(comparison).toBeVisible();
  await expect(
    comparison.getByRole('table', { name: 'Team differences' })
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('comparison.png') });
  await comparison.getByRole('button', { name: 'Use replacement' }).click();
  await expect(
    weavile.getByRole('button', { name: 'Change Weavile', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByLabel('Team name', { exact: true })
    .fill('My Weavile adaptation');
  await weavile
    .getByRole('button', { name: 'Edit Weavile set', exact: true })
    .click();
  const editor = page.getByRole('region', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const item = editor.getByLabel('Item', { exact: true });
  const ability = editor.getByLabel('Ability', { exact: true });
  const nature = editor.getByLabel('Nature', { exact: true });
  const spread = editor.getByLabel('EV spread', { exact: true });
  const moves = editor.getByRole('list', { name: 'Selected moves' });
  const initialItem = await item.inputValue();
  const initialAbility = await ability.inputValue();
  const initialNature = await nature.inputValue();
  const initialSpread = await spread.inputValue();
  const initialMoves = await moves.getByRole('listitem').allTextContents();
  expect(initialItem).not.toBe('');
  expect(initialAbility).not.toBe('');
  expect(initialNature).not.toBe('');
  expect(initialSpread).not.toBe('');
  expect(initialMoves).toHaveLength(4);
  await expect(
    page.getByRole('button', { name: 'Save changes', exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Copy team text', exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Change Sinistcha', exact: true })
  ).toBeDisabled();
  await expect(
    page
      .getByRole('region', { name: 'Similar teams', exact: true })
      .getByRole('button', { name: /^Compare / })
      .first()
  ).toBeDisabled();

  const itemChoices = editor
    .locator('#set-item-input')
    .locator('xpath=../following-sibling::div')
    .getByRole('button');
  const replacementItem = itemChoices
    .filter({ hasNotText: initialItem })
    .first();
  await expect(replacementItem).toBeVisible();
  const itemText = await replacementItem.textContent();
  await replacementItem.click();
  await expect(editor.getByLabel('Item', { exact: true })).toHaveValue(
    optionValue(itemText!)
  );
  await expect(ability).toHaveValue(initialAbility);
  await expect(spread).toHaveValue(initialSpread);
  await expect(moves).toHaveText(initialMoves.join(''));
  const abilityChoices = editor
    .locator('#set-ability-input')
    .locator('xpath=following-sibling::div')
    .getByRole('button');
  const replacementAbility = abilityChoices
    .filter({ hasNotText: initialAbility })
    .first();
  await expect(replacementAbility).toBeVisible();
  const abilityText = await replacementAbility.textContent();
  await replacementAbility.click();
  await expect(ability).toHaveValue(optionValue(abilityText!));
  await expect(item).toHaveValue(optionValue(itemText!));
  await expect(spread).toHaveValue(initialSpread);
  const spreadChoices = editor
    .locator('#set-evs-input')
    .locator('xpath=following-sibling::div')
    .getByRole('button');
  const replacementSpread = spreadChoices
    .filter({ hasNotText: initialSpread })
    .first();
  await expect(replacementSpread).toBeVisible();
  const spreadText = await replacementSpread.textContent();
  await replacementSpread.click();
  await expect(spread).toHaveValue(optionValue(spreadText!));
  await expect(ability).toHaveValue(optionValue(abilityText!));
  await expect(item).toHaveValue(optionValue(itemText!));
  await editor
    .getByRole('button', { name: `Remove ${initialMoves[0]}` })
    .click();
  await expect(moves).not.toContainText(initialMoves[0]);
  const suggestedMoves = editor
    .getByLabel('Custom move', { exact: true })
    .locator('xpath=../following-sibling::div')
    .getByRole('button');
  const suggestedMove = suggestedMoves.first();
  const suggestedMoveText = await suggestedMove.textContent();
  await suggestedMove.click();
  await expect(moves).toContainText(optionValue(suggestedMoveText!));
  await editor
    .getByRole('button', {
      name: `Remove ${optionValue(suggestedMoveText!)}`,
    })
    .click();
  const customMove = editor.getByLabel('Custom move', { exact: true });
  await customMove.fill('Test Move');
  await editor.getByRole('button', { name: 'Add move', exact: true }).click();
  await expect(moves).toContainText('Test Move');
  await editor
    .getByRole('button', { name: `Remove ${initialMoves[1]}` })
    .click();
  await customMove.fill('Test Move');
  await editor.getByRole('button', { name: 'Add move', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('same move twice');
  await customMove.fill('Another Test Move');
  await editor.getByRole('button', { name: 'Add move', exact: true }).click();
  await customMove.fill('One More Test Move');
  await editor.getByRole('button', { name: 'Add move', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('at most four moves');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Edit Weavile set' })
  ).toHaveCount(0);
  await expect(weavile).toContainText(initialItem);

  await weavile
    .getByRole('button', { name: 'Edit Weavile set', exact: true })
    .click();
  const reopened = page.getByRole('region', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expect(reopened.getByLabel('Item', { exact: true })).toHaveValue(
    initialItem
  );
  await expect(reopened.getByLabel('Ability', { exact: true })).toHaveValue(
    initialAbility
  );
  await expect(reopened.getByLabel('Nature', { exact: true })).toHaveValue(
    initialNature
  );
  await expect(reopened.getByLabel('EV spread', { exact: true })).toHaveValue(
    initialSpread
  );
  await expect(
    reopened.getByRole('list', { name: 'Selected moves' })
  ).toHaveText(initialMoves.join(''));
  await reopened.getByText('Advanced set text', { exact: true }).click();
  const set = reopened.getByLabel('Showdown set text', { exact: true });
  const setText = await set.inputValue();
  expect(setText).not.toMatch(/(?:IVs|Level|Tera Type):/);
  await set.fill(`${setText}\n- Protect`);
  await expect(
    reopened.getByRole('button', { name: 'Apply set', exact: true })
  ).toBeDisabled();
  await reopened
    .getByRole('button', { name: 'Load text into fields', exact: true })
    .click();
  await expect(reopened.getByRole('alert')).toContainText(
    'more than four moves'
  );
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!)[0].name,
      storageKey
    )
  ).toBe(peter.name);
  await reopened
    .getByRole('button', { name: 'Reset text', exact: true })
    .click();
  await set.fill(setText.replace(/EVs: [^\n]+/, 'EVs: 32 HP / 32 Atk / 2 Spe'));
  await reopened
    .getByRole('button', { name: 'Load text into fields', exact: true })
    .click();
  await reopened
    .getByRole('button', { name: 'Apply set', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Edit Weavile set' })
  ).toHaveCount(0);
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
  ).toHaveAttribute('aria-pressed', 'true');
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
  expect(stored.sources.length).toBe(2);
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

test('import, edit, reload, compare, and export a custom team', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/my-teams');
  await page.getByRole('link', { name: 'Add custom team' }).click();
  const teambuilder = page.getByRole('link', {
    name: 'Pokémon Showdown Teambuilder',
  });
  await expect(teambuilder).toHaveAttribute(
    'href',
    'https://play.pokemonshowdown.com/teambuilder'
  );
  await expect(teambuilder).toHaveAttribute('target', '_blank');
  await page.getByLabel('Team name', { exact: true }).fill('My custom team');
  await page.getByLabel('Team text', { exact: true }).fill(peter.paste!);
  await page.getByRole('button', { name: 'Save custom team' }).click();
  await expect(page).toHaveURL(/\/my-teams\?team=/);
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    'My custom team'
  );
  await page.getByText('Original & source history').click();
  await expect(
    page.getByText('No published sources; created from your team text.')
  ).toBeVisible();

  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  expect(stored.original.pasteUrl).toBe('');
  expect(stored.sources).toEqual([]);
  const storedWeavile = stored.original.members.find(
    (member: { pokemon: string }) => member.pokemon === 'Weavile'
  );
  expect(storedWeavile.item).toBe(
    peter.members.find((member) => member.pokemon === 'Weavile')!.item
  );
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit Weavile set', exact: true })
    .click();
  const editor = page.getByRole('region', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await editor.getByText('Advanced set text', { exact: true }).click();
  const set = editor.getByLabel('Showdown set text', { exact: true });
  await set.fill(
    (await set.inputValue()).replace(/Ability: .+/, 'Ability: Custom Ability')
  );
  await editor
    .getByRole('button', { name: 'Load text into fields', exact: true })
    .click();
  await editor.getByRole('button', { name: 'Apply set', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Changes saved on this device.'
  );
  await page.reload();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    'My custom team'
  );
  await expect(
    page
      .getByRole('region', { name: 'Similar teams', exact: true })
      .getByRole('article')
      .first()
  ).toBeVisible();
  await page.getByRole('button', { name: 'Copy team text' }).click();
  await expect(page.getByLabel('Export text')).toHaveValue(/Custom Ability/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('unknown and long card fields stay usable without phone overflow', async ({
  page,
}) => {
  await page.goto(`/teams/${peter.id}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page).toHaveURL(/\/my-teams\?team=/);
  const longName = 'VeryLongPokemonNameWithoutBreaks'.repeat(4);
  await page.evaluate(
    ({ key, longName }) => {
      const teams = JSON.parse(localStorage.getItem(key)!);
      teams[0].members[0].ability = null;
      teams[0].members[0].moves = [];
      teams[0].members[1].pokemon = longName;
      localStorage.setItem(key, JSON.stringify(teams));
    },
    { key: storageKey, longName }
  );
  await page.reload();

  const team = page.getByRole('region', { name: 'Your team', exact: true });
  await expect(
    team.getByText('Ability unknown', { exact: true })
  ).toBeVisible();
  await expect(team.getByText('Moves unknown', { exact: true })).toBeVisible();
  await expect(team.getByText(longName, { exact: true })).toBeVisible();
  await expect(team.locator('textarea')).toHaveCount(0);

  const firstPokemon = peter.members[0].pokemon;
  const change = team.getByRole('button', {
    name: `Change ${firstPokemon}`,
    exact: true,
  });
  await change.focus();
  await change.press('Enter');
  await expect(change).toHaveAttribute('aria-pressed', 'true');

  const edit = team.getByRole('button', {
    name: `Edit ${firstPokemon} set`,
    exact: true,
  });
  await edit.focus();
  await edit.press('Enter');
  const editor = page.getByRole('region', {
    name: `Edit ${firstPokemon} set`,
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const button of await editor.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test('inline draft changes warn before navigation', async ({ page }) => {
  await page.goto(`/teams/${peter.id}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit Weavile set', exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Edit Weavile set', exact: true })
    .getByLabel('Item', { exact: true })
    .fill('Unsaved item');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Browse teams', exact: true }).click();
  await expect(page).toHaveURL(/\/my-teams\?team=/);
});

test('invalid custom import never changes local storage', async ({ page }) => {
  await page.goto('/my-teams/new');
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey
  );
  await page.getByLabel('Team name', { exact: true }).fill('Invalid team');
  await page
    .getByLabel('Team text', { exact: true })
    .fill(peter.paste!.replace(/EVs:[^\r\n]*\r?\n/, ''));
  await page.getByRole('button', { name: 'Save custom team' }).click();
  await expect(page.getByRole('status')).toContainText('missing EVs');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe(before);
});

test('corrupt storage is reported and kept; missing local IDs do not show another team', async ({
  page,
}) => {
  await page.goto('/my-teams?team=missing');
  await expect(page.getByRole('status')).toContainText('not on this device');
  await page.evaluate(
    (key) => localStorage.setItem(key, '{broken'),
    storageKey
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('left untouched');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey)
  ).toBe('{broken');
});
