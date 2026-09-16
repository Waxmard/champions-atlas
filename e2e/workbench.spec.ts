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
  const initialSpread = (await spread.textContent())!;
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

  await expect(editor.getByLabel('Item suggestions')).toHaveCount(0);
  await expect(editor.getByLabel('Ability suggestions')).toHaveCount(0);
  await expect(editor.getByLabel('Move suggestions')).toHaveCount(0);
  await expect(editor.getByLabel('EV editor')).toHaveCount(0);
  await item.focus();
  await item.press('Escape');
  await expect(editor.getByLabel('Item suggestions')).toHaveCount(0);
  await editor.getByText('Advanced set text', { exact: true }).focus();
  await item.focus();
  const itemChoices = editor.getByLabel('Item suggestions').getByRole('button');
  const replacementItem = itemChoices
    .filter({ hasNotText: initialItem })
    .first();
  await expect(replacementItem).toBeVisible();
  const itemText = await replacementItem.textContent();
  await item.fill(optionValue(itemText!).slice(1, -1));
  await expect(replacementItem).toBeVisible();
  await replacementItem.click();
  await expect(editor.getByLabel('Item', { exact: true })).toHaveValue(
    optionValue(itemText!)
  );
  await expect(ability).toHaveValue(initialAbility);
  await expect(spread).toHaveText(initialSpread);
  await expect(moves).toHaveText(initialMoves.join(''));
  await ability.focus();
  await expect(editor.getByLabel('Item suggestions')).toHaveCount(0);
  const abilityChoices = editor
    .getByLabel('Ability suggestions')
    .getByRole('button');
  const replacementAbility = abilityChoices
    .filter({ hasNotText: initialAbility })
    .first();
  await expect(replacementAbility).toBeVisible();
  const abilityText = await replacementAbility.textContent();
  await ability.fill(optionValue(abilityText!).slice(1, -1));
  await expect(replacementAbility).toBeVisible();
  await replacementAbility.click();
  await expect(ability).toHaveValue(optionValue(abilityText!));
  await expect(item).toHaveValue(optionValue(itemText!));
  await expect(spread).toHaveText(initialSpread);
  await spread.click();
  const spreadChoices = editor
    .getByLabel('EV spread suggestions')
    .getByRole('button');
  const replacementSpread = spreadChoices
    .filter({ hasNotText: initialSpread })
    .first();
  await expect(replacementSpread).toBeVisible();
  await replacementSpread.click();
  await expect(editor.getByLabel('EV editor')).toContainText('66/66');
  await expect(ability).toHaveValue(optionValue(abilityText!));
  await expect(item).toHaveValue(optionValue(itemText!));
  const hp = editor.getByLabel('HP EV', { exact: true });
  const hpSlider = editor.getByLabel('HP EV slider', { exact: true });
  for (const [stat, value] of [
    ['HP', '1'],
    ['Atk', '32'],
    ['Def', '0'],
    ['SpA', '0'],
    ['SpD', '0'],
    ['Spe', '32'],
  ])
    await editor.getByLabel(`${stat} EV`, { exact: true }).fill(value);
  await expect(hpSlider).toHaveValue('1');
  await expect(editor.getByLabel('EV editor')).toContainText('65/66');
  await expect(
    editor.getByRole('button', { name: 'Apply set', exact: true })
  ).toBeDisabled();
  await hpSlider.fill('3');
  await expect(hp).toHaveValue('3');
  await expect(editor.getByLabel('EV editor')).toContainText('67/66');
  await hpSlider.fill('2');
  await expect(editor.getByLabel('EV editor')).toContainText('66/66');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(spread).toHaveText('2 HP / 32 Atk / 32 Spe');
  await nature.fill('a');
  await expect(page.getByRole('option', { name: 'Adamant' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Timid' })).toHaveCount(0);
  await nature.press('ArrowDown');
  await nature.press('Enter');
  await expect(nature).toHaveValue('Adamant');
  await nature.fill('ti');
  await page.getByRole('option', { name: 'Timid' }).click();
  await expect(nature).toHaveValue('Timid');
  await nature.fill('Not a nature');
  await editor.getByRole('button', { name: 'Apply set', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('standard nature');
  await nature.fill('timid');
  await editor.getByText('Advanced set text', { exact: true }).focus();
  await expect(nature).toHaveValue('Timid');
  await editor
    .getByRole('button', { name: `Remove ${initialMoves[0]}` })
    .click();
  await expect(moves).not.toContainText(initialMoves[0]);
  const customMove = editor.getByLabel('Custom move', { exact: true });
  await customMove.focus();
  const suggestedMoves = editor
    .getByLabel('Move suggestions')
    .getByRole('button');
  const suggestedMove = suggestedMoves.first();
  const suggestedMoveText = await suggestedMove.textContent();
  await customMove.fill(optionValue(suggestedMoveText!).slice(1, -1));
  await expect(suggestedMove).toBeVisible();
  await suggestedMove.click();
  await expect(moves).toContainText(optionValue(suggestedMoveText!));
  await editor
    .getByRole('button', {
      name: `Remove ${optionValue(suggestedMoveText!)}`,
    })
    .click();
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
  await expect(reopened.getByLabel('EV spread', { exact: true })).toHaveText(
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
    .getByRole('button', { name: 'Edit Weavile set', exact: true })
    .click();
  let editor = page.getByRole('region', { name: 'Edit Weavile set' });
  await editor.getByLabel('Item', { exact: true }).fill('Legacy custom item');
  await editor.getByRole('button', { name: 'Apply set', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(weavile).toContainText('Legacy custom item');

  await weavile
    .getByRole('button', { name: 'Edit Weavile set', exact: true })
    .click();
  editor = page.getByRole('region', { name: 'Edit Weavile set' });
  await editor.getByLabel('EV spread', { exact: true }).click();
  await editor.getByLabel('HP EV', { exact: true }).fill('31');
  await expect(editor.getByLabel('EV editor')).toContainText('31/66');
  await expect(
    editor.getByRole('button', { name: 'Apply set', exact: true })
  ).toBeDisabled();
});
