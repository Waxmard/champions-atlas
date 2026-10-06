import { expect, test } from '@playwright/test';
import type { Page, Locator, Dialog } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };
import { newSavedTeam } from '../src/lib/workbench';
import type { SavedTeam } from '../src/lib/workbench';
import type { Team } from '../src/lib/catalog';

const fixtureCatalog = catalog as { teams: Team[] };
const fixture = fixtureCatalog.teams.find((team) =>
  team.sheetIds.includes('MB809')
)!;
const storageKey = 'champions-atlas:teams:v1';
const weavileIndex = fixture.members.findIndex(
  ({ pokemon }) => pokemon === 'Weavile'
);
const originalWeavile = fixture.members[weavileIndex];
const historyPanel = (page: Page) =>
  page.locator('details[aria-label="Original & history"]');
const currentSlot = (page: Page, index = weavileIndex) =>
  page.locator(`#pokemon-slot-${index}`);

async function stored(page: Page): Promise<SavedTeam> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    storageKey
  );
}

async function saveFixture(page: Page) {
  await page.goto('/teams/' + fixture.id);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    fixture.name
  );
}

async function seed(page: Page, team: SavedTeam) {
  await page.goto('/?browse=all');
  await page.evaluate(
    ({ key, team }) => localStorage.setItem(key, JSON.stringify([team])),
    { key: storageKey, team }
  );
  await page.goto('/my-teams?team=' + team.id);
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    team.name
  );
}

async function openHistory(page: Page) {
  const panel = historyPanel(page);
  if ((await panel.getAttribute('open')) === null)
    await panel.locator(':scope > summary').click();
  await expect(
    panel.getByRole('button', { name: 'Restore original', exact: true })
  ).toBeVisible();
  return panel;
}

async function edit(
  page: Page,
  field: 'item' | 'moves' | 'EVs' | 'set text' | 'set' = 'item'
) {
  await currentSlot(page)
    .getByRole('button', { name: `Edit Weavile ${field}`, exact: true })
    .click();
  const editor = page.getByRole('dialog');
  await expect(editor).toBeVisible();
  return editor;
}

async function enter(editor: Locator, label: string, value: string) {
  const input = editor.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press('Enter');
}

async function restore(page: Page, panel: Locator, button: string) {
  const prompts: string[] = [];
  const handler = async (dialog: Dialog) => {
    prompts.push(dialog.message());
    await dialog.accept();
  };
  page.on('dialog', handler);
  await panel.getByRole('button', { name: button, exact: true }).click();
  page.off('dialog', handler);
  expect(prompts).toEqual([
    'Restore the original team? Your current sets will be replaced.',
  ]);
}

test('completed changes autosave together before Done and Restore original reverts them', async ({
  page,
}) => {
  const params = new URLSearchParams({
    browse: 'all',
    regulation: fixture.regulation,
  });
  for (const member of fixture.members)
    params.append('member', JSON.stringify([member.pokemon, '', '', '']));
  await page.goto('/?' + params);
  await expect(
    page.getByRole('button', { name: 'Remove Weavile', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Clear filters', exact: true })
  ).toBeEnabled();
  await page
    .getByRole('combobox', { name: 'Sort teams', exact: true })
    .selectOption('priority');
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('sort') === 'priority'
  );
  await expect(page.getByLabel('Regulation')).toHaveValue(fixture.regulation);
  const browseUrl = page.url();
  const results = page
    .getByRole('region', { name: 'Matching teams', exact: true })
    .getByRole('article');
  const fixtureLink = results
    .locator(`a[href^="/teams/${fixture.id}"]`)
    .first();
  await expect(fixtureLink).toBeVisible();
  const resultNames = await results.getByRole('heading').allTextContents();
  await fixtureLink.click();
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toHaveValue(
    fixture.name
  );
  const before = await stored(page);
  const editor = await edit(page);
  await expect(editor.getByLabel('Item', { exact: true })).toBeFocused();
  await enter(editor, 'Item', 'History custom item');
  await editor.getByLabel('Nature', { exact: true }).selectOption('Timid');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor.getByRole('button', { name: 'Edit moves', exact: true }).click();
  await enter(editor, 'Move 1', 'History custom move');
  await expect
    .poll(async () => (await stored(page)).members[weavileIndex].moves[0])
    .toBe('History custom move');
  const edited = await stored(page);
  expect(edited.history).toBeUndefined();
  expect(edited.original).toEqual(before.original);
  expect(edited.members.filter((_, index) => index !== weavileIndex)).toEqual(
    before.members.filter((_, index) => index !== weavileIndex)
  );
  expect(edited.members[weavileIndex].set).toContain(
    'Weavile (M) @ History custom item'
  );
  await expect(
    page.getByRole('button', { name: /^Apply|^Discard changes to/ })
  ).toHaveCount(0);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  expect((await stored(page)).members).toEqual(edited.members);
  const panel = await openHistory(page);
  await expect(
    panel.getByRole('region', { name: 'Version comparison', exact: true })
  ).toBeVisible();
  await expect(panel.getByText('Glimmora-Mega', { exact: true })).toHaveCount(
    0
  );
  await expect(
    panel.getByText(
      `Item: ${originalWeavile.item} → ${edited.members[weavileIndex].item}`,
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    panel.getByText(
      `Moves: ${originalWeavile.moves[0]} → History custom move`,
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    panel.getByText(
      `Moves: ${originalWeavile.moves.join(', ')} → ${edited.members[weavileIndex].moves.join(', ')}`,
      { exact: true }
    )
  ).toHaveCount(0);
  await expect(
    panel.getByText('Source sheet IDs: MB809', { exact: false })
  ).toBeVisible();
  if (fixture.creator)
    await expect(
      panel.getByText(fixture.creator, { exact: true })
    ).toBeVisible();
  await restore(page, panel, 'Restore original');
  expect((await stored(page)).members).toEqual(before.members);
  await page.reload();
  await openHistory(page);
  const restored = await stored(page);
  expect(restored.id).toBe(before.id);
  expect(restored.original).toEqual(before.original);
  expect(restored.sources).toEqual(before.sources);
  await page.getByRole('link', { name: 'Browse teams', exact: true }).click();
  await expect(page).toHaveURL(browseUrl);
  for (const member of fixture.members)
    await expect(
      page.getByRole('button', {
        name: `Remove ${member.pokemon}`,
        exact: true,
      })
    ).toBeVisible();
  await expect(page.getByLabel('Regulation')).toHaveValue(fixture.regulation);
  await expect(
    page.getByRole('combobox', { name: 'Sort teams', exact: true })
  ).toHaveValue('priority');
  await expect(results.getByRole('heading')).toHaveText(resultNames);
});

test('a custom starting team has no public provenance and Restore original discards the rename', async ({
  page,
}) => {
  await page.goto('/my-teams');
  await page
    .getByRole('link', { name: 'Add custom team', exact: true })
    .click();
  await page.getByLabel('Team name', { exact: true }).fill('Custom history');
  await page.getByLabel('Team text', { exact: true }).fill(fixture.paste!);
  await page
    .getByRole('button', { name: 'Save custom team', exact: true })
    .click();
  await expect(page).toHaveURL(/\/my-teams\?team=/);
  const before = await stored(page);
  const panel = await openHistory(page);
  await expect(
    panel.getByRole('heading', {
      name: 'Starting team details',
      exact: true,
    })
  ).toBeVisible();
  await expect(panel.getByText('Starting name', { exact: true })).toBeVisible();
  await expect(panel.getByText(/Some original metadata/)).toHaveCount(0);
  await expect(panel.getByRole('link')).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Restore original', exact: true })
  ).toBeDisabled();
  await page
    .getByLabel('Team name', { exact: true })
    .fill('Renamed custom history');
  await page.getByLabel('Team name', { exact: true }).press('Enter');
  await expect
    .poll(async () => (await stored(page)).name)
    .toBe('Renamed custom history');
  await restore(page, panel, 'Restore original');
  const restored = await stored(page);
  expect(restored.name).toBe(before.name);
  expect(restored.original).toEqual(before.original);
  expect(restored.sources).toEqual([]);
  await page.reload();
  await openHistory(page);
});

test('original suggestions lead after edits and using the original set saves within the editor visit', async ({
  page,
}) => {
  await saveFixture(page);
  let editor = await edit(page);
  await enter(editor, 'Item', 'History item');
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  editor = await edit(page);
  await editor.getByLabel('Item', { exact: true }).fill('');
  const firstItem = editor
    .getByLabel('Item suggestions', { exact: true })
    .getByRole('button')
    .first();
  await expect(firstItem).toContainText(originalWeavile.item!);
  await expect(firstItem).toContainText('Original');
  await firstItem.click();
  await expect
    .poll(async () => (await stored(page)).members[weavileIndex].item)
    .toBe(originalWeavile.item);
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor.getByRole('button', { name: 'Edit moves', exact: true }).click();
  await editor.getByLabel('Move 1', { exact: true }).fill('');
  const firstMove = editor
    .getByLabel('Move suggestions', { exact: true })
    .getByRole('button')
    .first();
  await expect(firstMove).toContainText(originalWeavile.moves[0]);
  await expect(firstMove).toContainText('Original');
  await firstMove.click();
  await enter(editor, 'Move 1', 'History move');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Edit EV spread', exact: true })
    .click();
  const originalSpread = editor
    .getByLabel('EV spread suggestions', { exact: true })
    .getByRole('button')
    .first();
  await expect(originalSpread).toContainText('Original team');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Use original set', exact: true })
    .click();
  expect((await stored(page)).members[weavileIndex]).toEqual(originalWeavile);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
});

test('order and slot conflicts survive the original restore', async ({
  page,
}) => {
  const team = newSavedTeam(fixture);
  team.members.reverse();
  const editedMember = team.members.find(
    ({ pokemon }) => pokemon === 'Weavile'
  )!;
  editedMember.set += '\nHappiness: 42';
  editedMember.privateMetadata = { retained: ['editor annotation'] };
  team.name = 'Reordered edited team';
  await seed(page, team);
  const panel = await openHistory(page);
  await expect(
    panel.getByText('These versions differ, but no field values changed.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Restore original', exact: true })
  ).toBeEnabled();
  await expect(
    panel
      .locator(`[data-original-slot="${weavileIndex}"]`)
      .getByText(/already in another slot/)
  ).toBeVisible();
  await restore(page, panel, 'Restore original');
  const saved = await stored(page);
  expect(saved.members).toEqual(fixture.members);
});

test('original slot restore changes only that slot and duplicate and Mega restrictions explain themselves', async ({
  page,
}) => {
  const team = newSavedTeam(fixture);
  team.members[weavileIndex] = {
    pokemon: 'Pikachu',
    item: null,
    ability: null,
    moves: [],
    nature: null,
    spread: null,
    set: 'Pikachu',
  };
  await seed(page, team);
  let panel = await openHistory(page);
  const originalSlot = panel.locator(`[data-original-slot="${weavileIndex}"]`);
  await originalSlot
    .getByRole('button', { name: 'Restore original set', exact: true })
    .click();
  const saved = await stored(page);
  expect(saved.members[weavileIndex]).toEqual(originalWeavile);
  expect(saved.members.filter((_, index) => index !== weavileIndex)).toEqual(
    team.members.filter((_, index) => index !== weavileIndex)
  );
  expect(saved.name).toBe(team.name);
  const megaIndex = fixture.members.findIndex(({ pokemon }) =>
    pokemon.endsWith('-Mega')
  );
  const blocked = newSavedTeam(fixture);
  blocked.members[megaIndex] = {
    pokemon: 'Pikachu',
    item: null,
    ability: null,
    moves: [],
    nature: null,
    spread: null,
    set: 'Pikachu',
  };
  blocked.members[weavileIndex] = {
    pokemon: 'Charizard-Mega-Y',
    item: 'Charizardite Y',
    ability: null,
    moves: [],
    nature: null,
    spread: null,
    set: 'Charizard @ Charizardite Y',
  };
  await seed(page, blocked);
  panel = await openHistory(page);
  const blockedSlot = panel.locator(`[data-original-slot="${megaIndex}"]`);
  await expect(
    blockedSlot.getByText(/exceed the two-Mega limit/)
  ).toBeVisible();
  await expect(
    blockedSlot.getByRole('button', {
      name: 'Restore original set',
      exact: true,
    })
  ).toBeDisabled();
  await restore(page, panel, 'Restore original');
  expect((await stored(page)).members).toEqual(fixture.members);
});

test('invalid EVs, duplicate moves and raw text never replace accepted autosaves, and Close discards only pending input', async ({
  page,
}) => {
  await saveFixture(page);
  let editor = await edit(page);
  await enter(editor, 'Item', 'Accepted before invalid input');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Edit EV spread', exact: true })
    .click();
  const beforeInvalid = await stored(page);
  await editor.getByLabel('HP EV', { exact: true }).fill('1');
  await editor.getByLabel('HP EV', { exact: true }).press('Tab');
  expect((await stored(page)).members).toEqual(beforeInvalid.members);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByText(/total 66 points/).first()).toBeVisible();
  await editor.getByLabel('Def EV', { exact: true }).fill('1');
  await editor.getByLabel('Def EV', { exact: true }).press('Tab');
  await expect
    .poll(async () => (await stored(page)).members[weavileIndex].spread)
    .toBe('1 HP / 32 Atk / 1 Def / 32 Spe');
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor.getByRole('button', { name: 'Edit moves', exact: true }).click();
  const valid = await stored(page);
  await enter(editor, 'Move 2', originalWeavile.moves[0]);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toBeVisible();
  expect((await stored(page)).members).toEqual(valid.members);
  const prompts: string[] = [];
  page.once('dialog', async (dialog) => {
    prompts.push(dialog.message());
    await dialog.accept();
  });
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(prompts).toEqual(['Discard unsaved input?']);
  expect((await stored(page)).members).toEqual(valid.members);
  editor = await edit(page, 'set text');
  await editor
    .getByRole('textbox', { name: 'Showdown set text', exact: true })
    .fill('');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('alert')).toBeFocused();
  await expect(
    editor.getByText('Paste set is missing a Pokémon')
  ).toBeVisible();
  expect((await stored(page)).members).toEqual(valid.members);
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Discard unsaved input?');
    await dialog.accept();
  });
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    currentSlot(page).getByRole('button', {
      name: 'Edit Weavile set text',
      exact: true,
    })
  ).toBeFocused();
  await page.reload();
  expect((await stored(page)).members).toEqual(valid.members);
});

test('failed writes retain form input for retry; Escape dismisses suggestions before closing', async ({
  page,
}) => {
  await saveFixture(page);
  const editor = await edit(page);
  await enter(editor, 'Item', 'First durable autosave');
  const accepted = await stored(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, '__restoreHistoryStorage', {
      configurable: true,
      value: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, storageKey);
  await enter(editor, 'Item', 'Retained failed input');
  await expect(
    editor.getByText(
      'Could not save this input. Your edits are still here. Close and reopen the editor, then try again.',
      {
        exact: true,
      }
    )
  ).toBeVisible();
  expect((await stored(page)).members).toEqual(accepted.members);
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Item', { exact: true })).toHaveValue(
    'Retained failed input'
  );
  await page.evaluate(() => {
    if (
      !('__restoreHistoryStorage' in window) ||
      typeof window.__restoreHistoryStorage !== 'function'
    )
      throw new Error('Storage restore hook missing');
    window.__restoreHistoryStorage();
  });
  await editor.getByLabel('Item', { exact: true }).press('Enter');
  await expect
    .poll(async () => (await stored(page)).members[weavileIndex].item)
    .toBe('Retained failed input');
  await editor.getByLabel('Item', { exact: true }).click();
  await expect(
    editor.getByLabel('Item suggestions', { exact: true })
  ).toBeVisible();
  await editor.getByLabel('Item', { exact: true }).press('Escape');
  await expect(editor).toBeVisible();
  await expect(
    editor.getByLabel('Item suggestions', { exact: true })
  ).toHaveCount(0);
  await editor.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(
    currentSlot(page).getByRole('button', {
      name: 'Edit Weavile item',
      exact: true,
    })
  ).toBeFocused();
});

test('legacy provenance keeps retained evidence and never links unsupported URLs', async ({
  page,
}) => {
  const team = newSavedTeam(fixture);
  delete team.origin;
  delete team.original.creator;
  team.original.pasteNotes = 'Retained source note';
  team.original.pasteError = 'Retained source fetch error';
  team.original.reports = [
    {
      event: 'Saved historical event',
      rank: 'Winner',
      sourceUrl: 'https://example.com/original',
    },
    {
      event: 'Unsupported source',
      rank: 'Top cut',
      sourceUrl: 'javascript:alert(1)',
    },
  ];
  team.history = [
    {
      id: 'older',
      savedAt: '2026-10-01T12:00:00.000Z',
      label: 'Renamed team',
      name: 'Older name',
      members: structuredClone(team.members),
    },
    {
      id: 'newer',
      savedAt: '2026-10-02T12:00:00.000Z',
      label: 'Edited Weavile',
      name: 'Newer name',
      members: structuredClone(team.members),
    },
  ];
  await seed(page, team);
  const panel = await openHistory(page);
  await expect(panel.getByText(/Some original metadata/)).toBeVisible();
  await expect(
    panel.getByText('Retained source note', { exact: true })
  ).toBeVisible();
  await expect(panel.getByText(/Retained source fetch error/)).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Original source 1', exact: true })
  ).toHaveAttribute('href', 'https://example.com/original');
  await expect(panel.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(
    panel.getByText('javascript:alert(1)', { exact: true })
  ).toBeVisible();
});

test('a published Pokémon swap autosaves without borrowing unrelated original suggestions', async ({
  page,
}) => {
  await saveFixture(page);
  const before = await stored(page);
  await currentSlot(page)
    .getByRole('button', { name: 'Change Weavile', exact: true })
    .click();
  const editor = page.getByRole('dialog');
  const option = editor
    .getByLabel('Pokémon suggestions', { exact: true })
    .getByRole('button')
    .first();
  await expect(option).toBeVisible();
  await option.click();
  await expect
    .poll(async () => (await stored(page)).members[weavileIndex].pokemon)
    .not.toBe('Weavile');
  const swapped = await stored(page);
  expect(swapped.original).toEqual(before.original);
  expect(swapped.members.filter((_, index) => index !== weavileIndex)).toEqual(
    before.members.filter((_, index) => index !== weavileIndex)
  );
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor
    .getByRole('button', {
      name: 'Edit item, ability, and nature',
      exact: true,
    })
    .click();
  await editor.getByLabel('Item', { exact: true }).focus();
  await expect(
    editor
      .getByLabel('Item suggestions', { exact: true })
      .getByText('Original', { exact: true })
  ).toHaveCount(0);
  await editor
    .getByRole('button', { name: 'Back to overview', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Use original set', exact: true })
    .click();
  expect((await stored(page)).members).toEqual(before.members);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test('only unsaved input warns on unload and pagehide flushes the latest bound value', async ({
  page,
}) => {
  await saveFixture(page);
  let editor = await edit(page);
  await enter(editor, 'Item', 'Durable before unload');
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })
  ).toBe(false);
  await editor.getByLabel('Item', { exact: true }).fill('Pagehide bound value');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect((await stored(page)).members[weavileIndex].item).toBe(
    'Pagehide bound value'
  );
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
  editor = await edit(page, 'set text');
  await editor
    .getByRole('textbox', { name: 'Showdown set text', exact: true })
    .fill('');
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })
  ).toBe(true);
  const beforeInvalid = await stored(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect((await stored(page)).members).toEqual(beforeInvalid.members);
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Discard unsaved input?');
    await dialog.accept();
  });
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })
  ).toBe(false);
});

test('an unknown original EV spread is not a restorable slot change', async ({
  page,
}) => {
  const team = newSavedTeam(fixture);
  team.original.members[weavileIndex] = {
    ...structuredClone(team.original.members[weavileIndex]),
    spread: null,
  };
  team.members[weavileIndex] = {
    ...structuredClone(team.members[weavileIndex]),
    spread: '2 HP / 32 Atk / 32 Spe',
  };
  await seed(page, team);
  const panel = await openHistory(page);
  await expect(
    panel.getByRole('button', { name: 'Restore original', exact: true })
  ).toBeEnabled();
  await expect(
    panel.locator(`[data-original-slot="${weavileIndex}"]`)
  ).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Restore original set', exact: true })
  ).toHaveCount(0);

  const cleared = newSavedTeam(fixture);
  cleared.members[weavileIndex] = {
    ...structuredClone(cleared.members[weavileIndex]),
    spread: null,
  };
  await seed(page, cleared);
  const slot = (await openHistory(page)).locator(
    `[data-original-slot="${weavileIndex}"]`
  );
  await expect(slot.getByText(/EVs: .+ → Unknown/)).toBeVisible();
  await expect(
    slot.getByRole('button', { name: 'Restore original set', exact: true })
  ).toBeEnabled();
});
