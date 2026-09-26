import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

const savedTeamsKey = 'champions-atlas:teams:v1';
const activeTeamKey = 'champions-atlas:active-team:v1';
const lastPageKey = 'champions-atlas:last-page:v1';
const fixtureTeam = (
  catalog as {
    teams: { id: string; name: string; sheetIds: string[] }[];
  }
).teams.find((team) => team.sheetIds.includes('MB809'))!;

function contextOptionsFor(
  baseURL: string | undefined,
  projectName: string
): BrowserContextOptions {
  const mobile = projectName === 'mobile';
  return {
    baseURL,
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
  };
}

async function openResumeContext(
  browser: Browser,
  context: BrowserContext,
  page: Page,
  options: BrowserContextOptions,
  destination: string,
  localValues: Record<string, string> = {},
  trackWrites = true
) {
  await page.evaluate(
    ({ key, destination, values }) => {
      localStorage.setItem(key, destination);
      for (const [name, value] of Object.entries(values))
        localStorage.setItem(name, value);
    },
    { key: lastPageKey, destination, values: localValues }
  );
  const storageState = await context.storageState();
  await context.close();
  const reopened = await browser.newContext({ ...options, storageState });
  const reopenedPage = await reopened.newPage();
  if (trackWrites) {
    await reopenedPage.addInitScript((key) => {
      const writes: string[] = [];
      Object.defineProperty(window, '__resumeWrites', { value: writes });
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) writes.push(value);
        setItem.call(this, name, value);
      };
    }, lastPageKey);
  }
  return { context: reopened, page: reopenedPage };
}

async function saveFixtureCopy(page: Page) {
  await page.goto('/teams/' + fixtureTeam.id);
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page).toHaveURL(/\/my-teams\?team=/);
  return new URL(page.url()).searchParams.get('team')!;
}

async function relativeRoute(page: Page) {
  return page.evaluate(
    () => location.pathname + location.search + location.hash
  );
}

async function expectStoredRoute(page: Page, expected: string) {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), lastPageKey))
    .toBe(expected);
  const writes = await page.evaluate(
    () =>
      (window as Window & { __resumeWrites?: string[] }).__resumeWrites ?? []
  );
  expect(writes).toContain(expected);
  expect(writes).not.toContain('/');
}

async function expectCurrentRouteStored(page: Page) {
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const current = location.pathname + location.search + location.hash;
        return current !== '/' && localStorage.getItem(key) === current;
      }, lastPageKey)
    )
    .toBe(true);
  const current = await relativeRoute(page);
  await expectStoredRoute(page, current);
  return current;
}

async function expectInvalidDestinationFallback(
  browser: Browser,
  context: BrowserContext,
  page: Page,
  baseURL: string | undefined,
  projectName: string,
  destination: string
) {
  await page.goto('/?browse=all');
  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, projectName),
    destination
  );
  try {
    await reopened.page.goto('/');
    await expect(
      reopened.page.getByRole('combobox', { name: 'Add Pokémon filter' })
    ).toBeVisible();
    expect(new URL(reopened.page.url()).origin).toBe(new URL(baseURL!).origin);
    const current = await expectCurrentRouteStored(reopened.page);
    expect(new URL(reopened.page.url()).pathname).toBe('/');
    expect(current).not.toContain('example.invalid');
    expect(current).not.toContain('admin');
  } finally {
    await reopened.context.close();
  }
}

async function addPokemon(page: Page, pokemon: string) {
  const picker = page.getByRole('combobox', { name: 'Add Pokémon filter' });
  await picker.fill(pokemon);
  await page.getByRole('option', { name: pokemon, exact: true }).click();
}

async function expectSelection(page: Page) {
  await expect(page.getByLabel('Regulation')).toHaveValue('all');
  await expect(page.getByRole('combobox', { name: 'Sort teams' })).toHaveValue(
    'recent'
  );
  await expect(
    page.getByRole('button', { name: 'Remove Incineroar', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove Rillaboom', exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Incineroar constraints' })
      .getByLabel('Held item')
  ).toHaveValue('Sitrus Berry');

  const cards = page
    .getByRole('region', { name: 'Matching teams' })
    .getByRole('article');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first().getByText(/^Reg /)).toBeVisible();
  for (let index = 0; index < (await cards.count()); index++) {
    await expect(
      cards.nth(index).getByText('Incineroar', { exact: true })
    ).toBeVisible();
    await expect(
      cards.nth(index).getByText('Rillaboom', { exact: true })
    ).toBeVisible();
  }
}

test('browse selections persist across navigation, reload, and reopen', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  const createdContexts = [];
  const contextOptions = contextOptionsFor(baseURL, testInfo.project.name);

  try {
    await page.goto('/?browse=all');
    await expect(page.getByLabel('Regulation')).toHaveValue('M-C');
    await expect(
      page.getByRole('combobox', { name: 'Add Pokémon filter' })
    ).toBeVisible();

    await addPokemon(page, 'Incineroar');
    await page
      .getByRole('region', { name: 'Incineroar constraints' })
      .getByLabel('Held item')
      .selectOption('Sitrus Berry');
    await addPokemon(page, 'Rillaboom');
    await page.getByLabel('Regulation').selectOption('all');
    await page
      .getByRole('combobox', { name: 'Sort teams' })
      .selectOption('recent');
    await expectSelection(page);

    await page.getByRole('link', { name: 'My teams' }).click();
    await page.getByRole('link', { name: 'Browse teams' }).click();
    await expectSelection(page);

    await page.getByRole('link', { name: 'My teams' }).click();
    await page.getByRole('link', { name: "Champion's Atlas" }).click();
    await expectSelection(page);
    await page.reload();
    await expectSelection(page);

    const firstState = await context.storageState();
    await context.close();

    const reopened = await browser.newContext({
      ...contextOptions,
      storageState: firstState,
    });
    createdContexts.push(reopened);
    let reopenedPage = await reopened.newPage();
    await reopenedPage.goto('/?browse=all');
    await expectSelection(reopenedPage);

    await reopenedPage.goto('/?regulation=M-B&sort=priority');
    await expect(reopenedPage.getByLabel('Regulation')).toHaveValue('M-B');
    await expect(
      reopenedPage.getByRole('combobox', { name: 'Sort teams' })
    ).toHaveValue('priority');
    await expect(
      reopenedPage.getByRole('button', { name: /^Remove / })
    ).toHaveCount(0);
    await expect(
      reopenedPage
        .getByRole('region', { name: 'Matching teams' })
        .getByText(/^Reg /)
    ).toHaveCount(0);

    await reopenedPage.getByRole('link', { name: 'My teams' }).click();
    await reopenedPage.getByRole('link', { name: 'Browse teams' }).click();
    await expect(reopenedPage.getByLabel('Regulation')).toHaveValue('M-B');
    await expect(
      reopenedPage.getByRole('button', { name: /^Remove / })
    ).toHaveCount(0);

    await reopenedPage.getByRole('button', { name: 'Clear filters' }).click();
    await expect(reopenedPage.getByLabel('Regulation')).toHaveValue('M-C');
    await expect(
      reopenedPage.getByRole('combobox', { name: 'Sort teams' })
    ).toHaveValue('priority');
    const clearedState = await reopened.storageState();
    await reopened.close();

    const cleared = await browser.newContext({
      ...contextOptions,
      storageState: clearedState,
    });
    createdContexts.push(cleared);
    reopenedPage = await cleared.newPage();
    await reopenedPage.goto('/?browse=all');
    await expect(reopenedPage.getByLabel('Regulation')).toHaveValue('M-C');
    await expect(
      reopenedPage.getByRole('combobox', { name: 'Sort teams' })
    ).toHaveValue('priority');
    await expect(
      reopenedPage.getByRole('button', { name: /^Remove / })
    ).toHaveCount(0);
  } finally {
    await Promise.all(
      createdContexts.map((created) =>
        created.pages().length ? created.close().catch(() => {}) : undefined
      )
    );
  }
});

test('QoL resume restores the exact detail path, query, and hash from bare root', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  const destination =
    '/teams/' + fixtureTeam.id + '?source=resume&encoded=%2F%26#team';
  await page.goto(destination);
  await expect(
    page.getByRole('heading', { name: fixtureTeam.name, exact: true })
  ).toBeVisible();

  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, testInfo.project.name),
    destination
  );
  try {
    await reopened.page.goto('/');
    await expect(reopened.page).toHaveURL(new URL(destination, baseURL).href);
    await expect(
      reopened.page.getByRole('heading', {
        name: fixtureTeam.name,
        exact: true,
      })
    ).toBeVisible();
    await expectStoredRoute(reopened.page, destination);
  } finally {
    await reopened.context.close();
  }
});

test('QoL resume restores filtered page two ahead of the active saved team', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  const activeId = await saveFixtureCopy(page);
  const params = new URLSearchParams({
    member: JSON.stringify(['Incineroar', '', '', '']),
    regulation: 'all',
    sort: 'recent',
    page: '2',
  });
  const destination = '/?' + params.toString();
  await page.goto(destination);
  await expect(page.getByLabel('Regulation')).toHaveValue('all');
  await expect(
    page.getByRole('navigation', { name: 'Team result pages' })
  ).toContainText(/Page 2 of [0-9]+/);
  const activeBefore = await page.evaluate(
    (key) => localStorage.getItem(key),
    activeTeamKey
  );
  expect(activeBefore).toBe(activeId);

  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, testInfo.project.name),
    destination
  );
  try {
    await reopened.page.goto('/');
    await expect(reopened.page).toHaveURL(new URL(destination, baseURL).href);
    await expect(reopened.page.getByLabel('Regulation')).toHaveValue('all');
    await expect(
      reopened.page.getByRole('combobox', { name: 'Sort teams' })
    ).toHaveValue('recent');
    await expect(
      reopened.page.getByRole('button', {
        name: 'Remove Incineroar',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      reopened.page.getByRole('navigation', { name: 'Team result pages' })
    ).toContainText(/Page 2 of [0-9]+/);
    await expect(
      reopened.page
        .getByRole('region', { name: 'Matching teams' })
        .getByRole('article')
        .first()
    ).toBeVisible();
    const activeAfter = await reopened.page.evaluate(
      (key) => localStorage.getItem(key),
      activeTeamKey
    );
    expect(activeAfter).toBe(activeId);
    const savedIds = await reopened.page.evaluate(
      (key) =>
        (JSON.parse(localStorage.getItem(key) ?? '[]') as { id: string }[]).map(
          (team) => team.id
        ),
      savedTeamsKey
    );
    expect(savedIds).toContain(activeId);
    await expectStoredRoute(reopened.page, destination);
  } finally {
    await reopened.context.close();
  }
});

test('QoL resume restores the selected My teams page', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  const teamId = await saveFixtureCopy(page);
  const destination = await relativeRoute(page);
  expect(destination).toBe('/my-teams?team=' + teamId);

  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, testInfo.project.name),
    destination
  );
  try {
    await reopened.page.goto('/');
    await expect(reopened.page).toHaveURL(new URL(destination, baseURL).href);
    await expect(
      reopened.page.getByRole('heading', { name: 'My teams', exact: true })
    ).toBeVisible();
    await expect(reopened.page.getByLabel('Saved team')).toHaveValue(teamId);
    await expect(
      reopened.page.getByRole('region', { name: 'Your team' })
    ).toBeVisible();
    await expect(
      reopened.page.getByLabel('Team name', { exact: true })
    ).toHaveValue(fixtureTeam.name);
    await expectStoredRoute(reopened.page, destination);
  } finally {
    await reopened.context.close();
  }
});

test('QoL resume explicit incoming filters override the stored destination', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  const storedParams = new URLSearchParams({
    member: JSON.stringify(['Incineroar', '', '', '']),
    regulation: 'all',
    sort: 'recent',
    page: '2',
  });
  const storedDestination = '/?' + storedParams.toString();
  const explicitDestination = '/?regulation=M-B&sort=priority';
  await page.goto(storedDestination);
  await expect(
    page.getByRole('button', { name: 'Remove Incineroar', exact: true })
  ).toBeVisible();

  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, testInfo.project.name),
    storedDestination
  );
  try {
    await reopened.page.goto(explicitDestination);
    await expect(reopened.page).toHaveURL(
      new URL(explicitDestination, baseURL).href
    );
    await expect(reopened.page.getByLabel('Regulation')).toHaveValue('M-B');
    await expect(
      reopened.page.getByRole('combobox', { name: 'Sort teams' })
    ).toHaveValue('priority');
    await expect(
      reopened.page.getByRole('button', { name: /^Remove / })
    ).toHaveCount(0);
    await expectStoredRoute(reopened.page, explicitDestination);
  } finally {
    await reopened.context.close();
  }
});

test('QoL resume explicit different team overrides the stored selection', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  const storedTeamId = await saveFixtureCopy(page);
  const incomingTeamId = await saveFixtureCopy(page);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: activeTeamKey,
    value: storedTeamId,
  });
  const storedDestination = '/my-teams?team=' + storedTeamId;
  const explicitDestination = '/my-teams?team=' + incomingTeamId;

  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, testInfo.project.name),
    storedDestination
  );
  try {
    await reopened.page.goto(explicitDestination);
    await expect(reopened.page).toHaveURL(
      new URL(explicitDestination, baseURL).href
    );
    await expect(reopened.page.getByLabel('Saved team')).toHaveValue(
      incomingTeamId
    );
    await expect(
      reopened.page.getByRole('region', { name: 'Your team' })
    ).toBeVisible();
    await expect(
      reopened.page.getByLabel('Team name', { exact: true })
    ).toHaveValue(fixtureTeam.name);
    const activeAfter = await reopened.page.evaluate(
      (key) => localStorage.getItem(key),
      activeTeamKey
    );
    expect(activeAfter).toBe(incomingTeamId);
    await expectStoredRoute(reopened.page, explicitDestination);
  } finally {
    await reopened.context.close();
  }
});

test('QoL resume ignores an external stored destination', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  await expectInvalidDestinationFallback(
    browser,
    context,
    page,
    baseURL,
    testInfo.project.name,
    'https://example.invalid/phishing?token=secret'
  );
});

test('QoL resume ignores an unknown stored route', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  await expectInvalidDestinationFallback(
    browser,
    context,
    page,
    baseURL,
    testInfo.project.name,
    '/admin/secret?token=secret'
  );
});

test('QoL resume ignores a stored login route', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  await expectInvalidDestinationFallback(
    browser,
    context,
    page,
    baseURL,
    testInfo.project.name,
    '/login'
  );
});

test('QoL resume repairs a deleted saved-team destination without looping', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  await page.goto('/?browse=all');
  const destination = '/my-teams?team=deleted-on-this-device';
  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, testInfo.project.name),
    destination,
    {
      [savedTeamsKey]: '[]',
      [activeTeamKey]: 'deleted-on-this-device',
    }
  );
  try {
    await reopened.page.goto('/');
    await expect(reopened.page).toHaveURL(new URL('/my-teams', baseURL).href);
    await expect(
      reopened.page.getByRole('heading', { name: 'My teams', exact: true })
    ).toBeVisible();
    await expect(reopened.page.getByText(/No saved teams yet/)).toBeVisible();
    await expect(reopened.page.getByLabel('Saved team')).toHaveCount(0);
    const stored = await reopened.page.evaluate(
      (keys) => ({
        teams: localStorage.getItem(keys.teams),
        active: localStorage.getItem(keys.active),
      }),
      { teams: savedTeamsKey, active: activeTeamKey }
    );
    expect(stored).toEqual({ teams: '[]', active: null });
    await expectStoredRoute(reopened.page, '/my-teams');
  } finally {
    await reopened.context.close();
  }
});

test('QoL resume replaces a missing catalog detail with usable Browse', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  await page.goto('/?browse=all');
  const destination = '/teams/not-in-catalog?source=resume#missing';
  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, testInfo.project.name),
    destination
  );
  try {
    await reopened.page.goto('/');
    await expect(
      reopened.page.getByRole('combobox', { name: 'Add Pokémon filter' })
    ).toBeVisible();
    const current = await expectCurrentRouteStored(reopened.page);
    expect(new URL(reopened.page.url()).pathname).toBe('/');
    expect(current).not.toContain('not-in-catalog');
  } finally {
    await reopened.context.close();
  }
});

test('QoL resume remains usable when localStorage is blocked', async ({
  browser,
  context,
  page,
  baseURL,
}, testInfo) => {
  await page.goto('/?browse=all');
  const reopened = await openResumeContext(
    browser,
    context,
    page,
    contextOptionsFor(baseURL, testInfo.project.name),
    '/teams/' + fixtureTeam.id,
    {},
    false
  );
  const errors: string[] = [];
  reopened.page.on('pageerror', (error) => errors.push(error.message));
  await reopened.page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is blocked', 'SecurityError');
      },
    });
  });
  try {
    await reopened.page.goto('/');
    await expect(
      reopened.page.getByRole('combobox', { name: 'Add Pokémon filter' })
    ).toBeVisible();
    await expect(reopened.page.getByLabel('Regulation')).toHaveValue('M-C');
    expect(new URL(reopened.page.url()).pathname).toBe('/');
    expect(errors).toEqual([]);
  } finally {
    await reopened.context.close();
  }
});
