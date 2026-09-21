import { expect, test } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

const peter = catalog.teams.find((team) => team.sheetIds.includes('MB809'))!;
const storageKey = 'champions-atlas:teams:v1';

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
  await expect(page.getByText('Original & source history')).toHaveCount(0);

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
    .getByRole('button', { name: 'Edit Weavile set text', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  const set = editor.getByRole('textbox', {
    name: 'Showdown set text',
    exact: true,
  });
  await set.fill(
    (await set.inputValue()).replace(/Ability: .+/, 'Ability: Custom Ability')
  );
  await editor
    .getByRole('button', { name: 'Apply to team', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Changes saved on this device.'
  );
  await page.reload();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    'My custom team'
  );
  await expect(page.getByRole('region', { name: 'Similar teams' })).toHaveCount(
    0
  );
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
  await change.click();
  await expect(
    page.getByRole('dialog', { name: `Edit ${firstPokemon} set`, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Pokémon', exact: true })
  ).toBeFocused();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const edit = team.getByRole('button', {
    name: `Edit ${firstPokemon} item`,
    exact: true,
  });
  await edit.focus();
  await edit.press('Enter');
  const editor = page.getByRole('dialog', {
    name: `Edit ${firstPokemon} set`,
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expect(
    editor.getByRole('heading', {
      name: 'Item, ability, and nature',
      exact: true,
    })
  ).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  for (const button of await editor.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await editor.getByLabel('Item', { exact: true }).press('Escape');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit).toBeFocused();
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
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Edit Weavile set', exact: true })
    .getByLabel('Item', { exact: true })
    .fill('Unsaved item');
  await page
    .getByRole('dialog', { name: 'Edit Weavile set', exact: true })
    .getByLabel('Item', { exact: true })
    .press('Escape');
  await page
    .getByRole('button', { name: 'Apply to team', exact: true })
    .click();
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

test('set edit commits on save and reopening my-teams restores active team', async ({
  page,
}) => {
  await page.goto(`/teams/${peter.id}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
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
  await editor.getByLabel('Item', { exact: true }).fill('Focus Sash');
  await editor.getByLabel('Item', { exact: true }).press('Escape');
  await editor
    .getByRole('button', { name: 'Apply to team', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  const storedWeavile = stored.members.find(
    (m: { pokemon: string }) => m.pokemon === 'Weavile'
  );
  expect(storedWeavile.item).toBe('Focus Sash');
  await page.goto('/my-teams');
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    peter.name
  );
  await expect(weavile.getByText('Focus Sash', { exact: true })).toBeVisible();
});

test('item edits preserve an unknown nature', async ({ page }) => {
  await page.goto(`/teams/${peter.id}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page).toHaveURL(/\/my-teams\?team=/);
  await page.evaluate((key) => {
    const teams = JSON.parse(localStorage.getItem(key)!);
    const member = teams[0].members.find(
      ({ pokemon }: { pokemon: string }) => pokemon === 'Weavile'
    );
    member.nature = null;
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
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await editor.getByLabel('Item', { exact: true }).fill('Focus Sash');
  await editor.getByLabel('Item', { exact: true }).press('Escape');
  await editor
    .getByRole('button', { name: 'Apply to team', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
  const storedWeavile = stored.members.find(
    (member: { pokemon: string }) => member.pokemon === 'Weavile'
  );
  expect(storedWeavile.nature).toBeNull();
  expect(storedWeavile.item).toBe('Focus Sash');
});

test('backdrop and blank-area clicks retain set edit until explicit action', async ({
  page,
}, testInfo) => {
  await page.goto('/teams/' + peter.id);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  const originalItem = peter.members.find(
    (m: { pokemon: string }) => m.pokemon === 'Weavile'
  )!.item;
  await weavile
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  const item = editor.getByLabel('Item', { exact: true });
  await item.fill('Choice Band');
  if (!testInfo.project.use.isMobile) await page.mouse.click(1, 1);
  await expect(editor).toBeVisible();
  await expect(item).toHaveValue('Choice Band');
  await editor.click({ position: { x: 12, y: 180 } });
  await expect(editor).toBeVisible();
  await expect(item).toHaveValue('Choice Band');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(weavile.getByText(originalItem, { exact: true })).toBeVisible();
  await weavile
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  await expect(editor).toBeVisible();
  await editor.getByLabel('Item', { exact: true }).fill('Choice Band');
  await editor
    .getByRole('button', { name: 'Apply to team', exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(weavile.getByText('Choice Band', { exact: true })).toBeVisible();
});

test('background navigation clicks retain the editor', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.use.isMobile,
    'Desktop-only: header is visible without scrolling'
  );
  await page.goto('/teams/' + peter.id);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Weavile set', exact: true })
    .getByRole('button', { name: 'Edit Weavile item', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expect(editor).toBeVisible();
  const url = page.url();
  const browse = page.getByRole('link', { name: 'Browse teams', exact: true });
  const box = await browse.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(editor).toBeVisible();
  await expect(page).toHaveURL(url);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('visibility changes keep move and item edits mounted', async ({
  page,
}) => {
  await page.goto('/teams/' + peter.id);
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
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await editor.getByRole('button', { name: 'Edit moves', exact: true }).click();
  const move = editor.getByLabel('Move 2', { exact: true });
  await move.fill('Test Move');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor
    .getByRole('button', {
      name: 'Edit item, ability, and nature',
      exact: true,
    })
    .click();
  const item = editor.getByLabel('Item', { exact: true });
  await item.fill('Choice Band');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(editor).toBeVisible();
  await expect(item).toHaveValue('Choice Band');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor.getByRole('button', { name: 'Edit moves', exact: true }).click();
  await expect(editor.getByLabel('Move 2', { exact: true })).toHaveValue(
    'Test Move'
  );
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('lower-slot nature editing stays visible and persists on mobile', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'Mobile-only regression');
  await page.goto(`/teams/${peter.id}`);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();

  const member = peter.members.at(-1)!;
  const card = page.getByRole('region', {
    name: `${member.pokemon} set`,
    exact: true,
  });
  const edit = card.getByRole('button', {
    name: `Edit ${member.pokemon} nature`,
    exact: true,
  });
  await edit.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await edit.click();

  const editor = page.getByRole('dialog', {
    name: `Edit ${member.pokemon} set`,
    exact: true,
  });
  await expect(editor).toBeInViewport();
  const box = await page.getByRole('dialog').boundingBox();
  const viewport = (await page.viewportSize())!;
  expect(box?.x).toBeCloseTo(0, 0);
  expect(box?.y).toBeCloseTo(0, 0);
  expect(box?.width).toBeCloseTo(viewport.width, 0);
  expect(box?.height).toBeCloseTo(viewport.height, 0);
  const nature = editor.getByLabel('Nature', { exact: true });
  const initialNature = await nature.inputValue();
  const replacementNature = initialNature === 'Adamant' ? 'Jolly' : 'Adamant';
  await nature.selectOption(replacementNature);
  await editor
    .getByRole('button', { name: 'Apply to team', exact: true })
    .click();
  await expect(edit).toBeFocused();
  await expect(card).toContainText(replacementNature);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const storedNature = await page.evaluate(
    ({ key, pokemon }) => {
      const team = JSON.parse(localStorage.getItem(key)!)[0];
      return team.members.find(
        (saved: { pokemon: string }) => saved.pokemon === pokemon
      ).nature;
    },
    { key: storageKey, pokemon: member.pokemon }
  );
  expect(storedNature).toBe(replacementNature);
  await page.getByRole('button', { name: 'Copy team text' }).click();
  await expect(page.getByLabel('Export text')).toHaveValue(
    new RegExp(`${replacementNature} Nature`)
  );
  await page.reload();
  await expect(
    page.getByRole('region', {
      name: `${member.pokemon} set`,
      exact: true,
    })
  ).toContainText(replacementNature);
});
