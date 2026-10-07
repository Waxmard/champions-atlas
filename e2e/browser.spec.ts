import { expect, test, type Page } from '@playwright/test';

const expectWithin = (actual: number, expected: number, tolerance = 1) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

const addPokemonFilter = async (
  page: Page,
  name: string,
  expectRemoveButton = true
) => {
  const picker = page.getByRole('combobox', { name: 'Add Pokémon filter' });
  await expect(async () => {
    await picker.fill(name);
    await expect(page.getByRole('option', { name, exact: true })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await expect(page.locator('[role="option"][data-highlighted]')).toHaveText(
    name
  );
  await picker.press('Enter');
  if (expectRemoveButton)
    await expect(
      page.getByRole('button', { name: `Remove ${name}`, exact: true })
    ).toBeVisible();
};

test('sprite cards, responsive filters, and external attribution work', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const picker = page.getByRole('combobox', { name: 'Add Pokémon filter' });
  await expect(picker).toBeVisible();

  const cards = page
    .getByRole('region', { name: 'Matching teams' })
    .getByRole('article');
  const card = cards.first();
  const sprites = card.locator('img[src*="/sprites/"]');
  const sprite = sprites.first();
  await expect(sprite).toBeVisible();
  await expect
    .poll(() =>
      sprites.evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0)
      )
    )
    .toBe(true);

  const member = card
    .getByRole('list', { name: 'Team members' })
    .getByRole('listitem')
    .first();
  const species = await member.locator('p').first().innerText();
  await sprite.dispatchEvent('error');
  await expect(sprite).toBeHidden();
  await expect(card.getByText(species, { exact: true })).toBeVisible();

  const attribution = page.locator(
    'a[href="https://github.com/PokeAPI/sprites"]'
  );
  await expect(attribution).toHaveAttribute('target', '_blank');
  await expect(attribution).toHaveAttribute('rel', /external/);
  await expect(attribution).toHaveAttribute('rel', /noreferrer/);
  const itemAttribution = page.locator(
    'a[href="https://github.com/smogon/sprites"]'
  );
  await expect(itemAttribution).toHaveAttribute('target', '_blank');
  await expect(itemAttribution).toHaveAttribute('rel', /external/);

  if (testInfo.project.use.isMobile) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  }
});

test('multi-Pokémon item filters survive details, Back, Forward, and reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');

  const filterPane = page.locator('.browse-filter-scroll');
  const resultsPane = page.locator('.browse-results-scroll');
  const typeToggle = page.getByRole('button', { name: 'Filter by type' });
  const typeInput = page.getByRole('combobox', { name: 'Filter by type' });
  const paneScrollTops = () =>
    page.evaluate(() => {
      const filters = document.querySelector('.browse-filter-scroll');
      const results = document.querySelector('.browse-results-scroll');
      if (!filters || !results) throw new Error('Browse panes are missing.');
      return { filters: filters.scrollTop, results: results.scrollTop };
    });
  const shellRects = () =>
    page.evaluate(() => {
      const header = document.querySelector('.browse-results-header');
      const results = document.querySelector('.browse-results');
      if (!header || !results) throw new Error('Results shell is missing.');
      return {
        header: header.getBoundingClientRect().toJSON(),
        results: results.getBoundingClientRect().toJSON(),
        windowScrollY: window.scrollY,
      };
    });

  await resultsPane.evaluate((pane) => (pane.scrollTop = pane.scrollHeight));
  const beforePaging = await shellRects();
  const pages = page.getByRole('navigation', { name: 'Team result pages' });
  await pages.getByRole('button', { name: 'Next' }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('page'))
    .toBe('2');
  await expect
    .poll(() => resultsPane.evaluate((pane) => pane.scrollTop))
    .toBe(0);
  const afterPaging = await shellRects();
  expectWithin(afterPaging.header.top, beforePaging.header.top);
  expectWithin(afterPaging.header.height, beforePaging.header.height);
  expectWithin(afterPaging.results.top, beforePaging.results.top);
  expectWithin(afterPaging.windowScrollY, beforePaging.windowScrollY);
  await pages.getByRole('button', { name: 'Previous' }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.has('page'))
    .toBe(false);
  await expect
    .poll(() => resultsPane.evaluate((pane) => pane.scrollTop))
    .toBe(0);

  await addPokemonFilter(page, 'Incineroar');
  await addPokemonFilter(page, 'Rillaboom');
  await page
    .getByRole('region', { name: 'Incineroar constraints' })
    .getByLabel('Held item')
    .selectOption('Sitrus Berry');
  await page
    .getByRole('combobox', { name: 'Sort teams' })
    .selectOption('recent');
  await typeToggle.click();
  await expect(typeInput).toBeVisible();
  await expect(typeToggle).toHaveAttribute('aria-expanded', 'true');
  const query = new URL(page.url()).search;
  expect(new URLSearchParams(query).getAll('member')).toHaveLength(2);
  const cards = page
    .getByRole('region', { name: 'Matching teams' })
    .getByRole('article');
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    await expect(cards.nth(i)).toContainText('Incineroar');
    await expect(cards.nth(i)).toContainText('Rillaboom');
  }
  const target = cards.last();
  // Playwright scrolls the card link into view before clicking, so capture the
  // pane offsets once that scroll has settled; a phone card is taller than the
  // results pane, so the click scrolls even when the pane already sits at its end.
  await target.getByRole('link').scrollIntoViewIfNeeded();
  await filterPane.evaluate((pane) => (pane.scrollTop = pane.scrollHeight));
  const scrolled = await paneScrollTops();
  expect(scrolled.results).toBeGreaterThan(0);
  const firstName = await target.getByRole('heading').innerText();
  const detailHref = await target.getByRole('link').getAttribute('href');
  expect(detailHref).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath('filtered-catalog.png'),
    fullPage: false,
  });
  if (testInfo.project.use.isMobile) {
    await target.getByRole('link').tap();
  } else {
    await target.getByRole('link').click();
  }
  await expect(page).toHaveURL(
    new RegExp(`${detailHref!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstName);
  await expect(
    page.getByRole('heading', { name: 'Results & sources' })
  ).toBeVisible();
  const published = page.getByText('Published paste text').locator('..');
  await published.locator('summary').click();
  await expect(published.locator('pre')).not.toContainText('Level:');
  await expect(published.locator('pre')).not.toContainText('Tera Type:');
  await expect(published.locator('pre')).not.toContainText('IVs:');
  await expect(
    page
      .getByRole('region', { name: 'Pokémon sets' })
      .locator('img[src*="/items/"]')
      .first()
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to teams' }).click();
  await expect(page).toHaveURL(
    new RegExp(`\\?${query.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  );
  await expect(
    page
      .getByRole('region', { name: 'Incineroar constraints' })
      .getByLabel('Held item')
  ).toHaveValue('Sitrus Berry');
  await expect(typeInput).toBeVisible();
  const paneDifference = async (pane: 'filters' | 'results') =>
    Math.abs((await paneScrollTops())[pane] - scrolled[pane]);
  await expect.poll(() => paneDifference('results')).toBeLessThanOrEqual(2);
  await expect.poll(() => paneDifference('filters')).toBeLessThanOrEqual(2);
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstName);
  await page.goBack();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Remove Rillaboom', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Sort teams' })).toHaveValue(
    'recent'
  );
  await expect(typeInput).toBeVisible();
  await expect.poll(() => paneDifference('results')).toBeLessThanOrEqual(2);
  await expect.poll(() => paneDifference('filters')).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('invalid filters stay explicit; team deep links and missing teams work', async ({
  page,
}) => {
  await page.goto('/?member=invalid');
  await expect(
    page.getByRole('heading', { name: 'Invalid filter link' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).last().click();
  await expect(page).not.toHaveURL(/member=/);
  await page.goto(
    `/?member=${encodeURIComponent(
      JSON.stringify(['Incineroar', 'NotAnItem', '', ''])
    )}`
  );
  await expect(
    page.getByRole('heading', { name: 'No matching teams' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Invalid filter link' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).last().click();
  const card = page
    .getByRole('region', { name: 'Matching teams' })
    .getByRole('article')
    .first();
  await expect(card).toBeVisible();
  const href = await card.getByRole('link').getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(href!);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Results & sources' })
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to teams' }).click();
  await expect(
    page.getByRole('heading', { name: 'Explore teams' })
  ).toBeVisible();
  // A static SPA serves the same shell for every path, so a missing team is
  // observable as the rendered 404 page rather than an HTTP status code.
  await page.goto('/teams/not-a-team');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  await expect(page.getByText('Team not found in this catalog.')).toBeVisible();
});

test('QoL picker clears untyped keyboard choices and permits reselecting', async ({
  page,
}) => {
  await page.goto('/');
  const picker = page.getByRole('combobox', { name: 'Add Pokémon filter' });
  await picker.press('ArrowDown');
  await expect(
    page.getByRole('listbox').getByRole('option').first()
  ).toBeVisible();
  await picker.press('Enter');
  const remove = page.getByRole('button', { name: /^Remove / }).first();
  await expect(remove).toBeVisible();
  const label = await remove.getAttribute('aria-label');
  expect(label).toBeTruthy();
  await expect(picker).toHaveValue('');
  await remove.click();
  await expect(remove).toHaveCount(0);
  await picker.press('ArrowDown');
  await expect(
    page.getByRole('listbox').getByRole('option').first()
  ).toBeVisible();
  await picker.press('Enter');
  await expect(
    page.getByRole('button', { name: label!, exact: true })
  ).toBeVisible();
  await expect(picker).toHaveValue('');
});

test('QoL pinned navigation stays reachable across scroll and viewport sizes', async ({
  page,
}) => {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) throw new Error('A browser viewport is required.');

  const shellBounds = () =>
    page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Main"]');
      const header = nav?.closest('header');
      if (!nav || !header) throw new Error('Main navigation is missing.');
      const bounds = (element: Element) => {
        const { top, bottom, left, right, width, height } =
          element.getBoundingClientRect();
        return { top, bottom, left, right, width, height };
      };
      return {
        scrollY: window.scrollY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        header: bounds(header),
        nav: bounds(nav),
        targets: [...header.querySelectorAll('a, button')].map(bounds),
      };
    });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Explore teams' })
  ).toBeVisible();
  const mainNav = page.getByRole('navigation', { name: 'Main' });
  const browse = mainNav.getByRole('link', { name: 'Browse', exact: true });
  const myTeams = mainNav.getByRole('link', { name: 'My teams', exact: true });
  await expect(browse).toHaveAttribute('aria-current', 'page');

  await page
    .locator('.browse-results-scroll')
    .evaluate((pane) => (pane.scrollTop = pane.scrollHeight));
  const scrolled = await shellBounds();
  expect(scrolled.scrollY).toBeLessThanOrEqual(1);
  for (const box of [scrolled.header, scrolled.nav]) {
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(scrolled.viewportHeight);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(scrolled.viewportWidth);
  }

  await myTeams.click();
  await expect(page).toHaveURL(/\/my-teams$/);
  await expect(myTeams).toHaveAttribute('aria-current', 'page');
  await expect(browse).not.toHaveAttribute('aria-current', 'page');
  await browse.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(browse).toHaveAttribute('aria-current', 'page');
  await expect(myTeams).not.toHaveAttribute('aria-current', 'page');

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: viewport.height });
    const responsive = await shellBounds();
    expect(responsive.documentWidth).toBeLessThanOrEqual(width);
    expect(responsive.targets.length).toBeGreaterThanOrEqual(3);
    for (const target of responsive.targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
  }

  await page.setViewportSize(viewport);
  const firstCard = page
    .getByRole('region', { name: 'Matching teams' })
    .getByRole('article')
    .first();
  await firstCard.getByRole('link').first().click();
  await expect(
    page.getByRole('button', { name: 'Use this team' })
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page).toHaveURL(/\/my-teams\?team=/);

  await page
    .getByRole('link', { name: /^Go to / })
    .first()
    .click();
  await expect(page).toHaveURL(/#pokemon-slot-0$/);
  const rosterTarget = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    const header = nav?.closest('header');
    const target = document.querySelector('#pokemon-slot-0');
    if (!header || !target) throw new Error('Roster jump target is missing.');
    return {
      headerBottom: header.getBoundingClientRect().bottom,
      targetTop: target.getBoundingClientRect().top,
    };
  });
  expect(rosterTarget.targetTop).toBeGreaterThanOrEqual(
    rosterTarget.headerBottom
  );

  const teamUrl = new URL(page.url());
  teamUrl.hash = '';
  await page.goto(teamUrl.pathname + teamUrl.search);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  const skipTarget = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    const header = nav?.closest('header');
    const target = document.querySelector('#main');
    if (!header || !target) throw new Error('Skip target is missing.');
    return {
      headerBottom: header.getBoundingClientRect().bottom,
      targetTop: target.getBoundingClientRect().top,
    };
  });
  expect(skipTarget.targetTop).toBeGreaterThanOrEqual(skipTarget.headerBottom);
});

test('short-landscape browsing keeps results beside usable filters', async ({
  page,
}) => {
  const assertTouchable = async (target: ReturnType<typeof page.getByRole>) => {
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (!box || !viewport)
      throw new Error('A visible viewport target is required.');
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  };

  const readGeometry = () =>
    page.evaluate(() => {
      const controls = document.querySelector('.browse-controls');
      const results = document.querySelector('.browse-results');
      const header = document.querySelector('.browse-results-header');
      if (!controls || !results || !header)
        throw new Error('Browse layout geometry is incomplete.');
      const rect = (element: Element) =>
        element.getBoundingClientRect().toJSON();
      return {
        controls: rect(controls),
        results: rect(results),
        header: rect(header),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        scrollY: window.scrollY,
      };
    });

  for (const scenario of [
    { width: 390, height: 844, arrangement: 'stacked' },
    { width: 667, height: 375, arrangement: 'columns' },
    { width: 320, height: 720, arrangement: 'stacked' },
  ] as const) {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.goto('/?regulation=M-C&sort=priority');

    const matching = page.getByRole('region', { name: 'Matching teams' });
    const firstCard = matching.getByRole('article').first();
    await expect(firstCard).toBeVisible();
    const baseline = await readGeometry();
    expect(baseline.results.top).toBeLessThan(baseline.viewportHeight);
    expect(baseline.results.bottom).toBeLessThanOrEqual(
      baseline.viewportHeight + 1
    );
    expect(baseline.documentWidth).toBeLessThanOrEqual(baseline.viewportWidth);
    if (scenario.arrangement === 'columns')
      expect(baseline.results.left).toBeGreaterThanOrEqual(
        baseline.controls.right - 1
      );
    else
      expect(baseline.results.top).toBeGreaterThanOrEqual(
        baseline.controls.bottom - 1
      );

    const typeToggle = page.getByRole('button', { name: 'Filter by type' });
    await assertTouchable(typeToggle);
    await typeToggle.click();
    const typeInput = page.getByRole('combobox', { name: 'Filter by type' });
    await assertTouchable(typeInput);
    await typeInput.fill('fire');
    const fireOption = page.getByRole('option', { name: 'fire', exact: true });
    await assertTouchable(fireOption);
    await typeInput.press('ArrowDown');
    await typeInput.press('Enter');
    await typeInput.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Remove fire type filter', exact: true })
    ).toBeVisible();

    const regulation = page.getByRole('combobox', {
      name: 'Regulation',
      exact: true,
    });
    const sort = page.getByRole('combobox', { name: 'Sort teams' });
    if (scenario.width === 390) {
      await assertTouchable(regulation);
      await regulation.selectOption('all');
      await expect
        .poll(() => new URL(page.url()).searchParams.get('regulation'))
        .toBe('all');
      await regulation.selectOption('M-C');
      await assertTouchable(sort);
      await sort.selectOption('recent');
      await expect
        .poll(() => new URL(page.url()).searchParams.get('sort'))
        .toBe('recent');
      await sort.selectOption('priority');
      await expect
        .poll(() => new URL(page.url()).searchParams.get('sort'))
        .toBe('priority');
    }

    await addPokemonFilter(page, 'Incineroar');
    await addPokemonFilter(page, 'Rillaboom');
    const filtered = await readGeometry();
    expectWithin(filtered.results.top, baseline.results.top);
    expectWithin(filtered.results.height, baseline.results.height);
    expectWithin(filtered.header.top, baseline.header.top);
    expectWithin(filtered.header.height, baseline.header.height);
    expect(filtered.results.bottom).toBeLessThanOrEqual(
      filtered.viewportHeight + 1
    );
    expect(filtered.documentWidth).toBeLessThanOrEqual(filtered.viewportWidth);
    expectWithin(filtered.scrollY, baseline.scrollY);

    const heldItem = page
      .getByRole('region', { name: 'Incineroar constraints' })
      .getByLabel('Held item');
    const heldItemTarget = await heldItem.evaluate(
      (select) =>
        [...(select as HTMLSelectElement).options]
          .map((option) => option.value)
          .filter(Boolean)
          .find(
            (value, _index, values) =>
              values.filter((other) => other[0] === value[0]).length === 1
          ) ?? ''
    );
    expect(heldItemTarget).toBeTruthy();
    await heldItem.focus();
    await page.keyboard.press(heldItemTarget[0].toLowerCase());
    await expect(heldItem).toHaveValue(heldItemTarget);
    await heldItem.selectOption('');

    await assertTouchable(
      page
        .getByRole('region', { name: 'Rillaboom constraints' })
        .getByRole('combobox', { name: 'Move', exact: true })
    );

    const species = await firstCard
      .getByRole('list', { name: 'Team members' })
      .getByRole('listitem')
      .evaluateAll((items) =>
        items
          .map((item) => item.querySelector('p')?.textContent?.trim() ?? '')
          .find((name) => name !== 'Incineroar' && name !== 'Rillaboom')
      );
    expect(species).toBeTruthy();
    const picker = page.getByRole('combobox', { name: 'Add Pokémon filter' });
    // The pane was scrolled to reach the constraint fields, so bring the picker
    // back into view before typing; its popup follows the input it anchors to.
    await picker.scrollIntoViewIfNeeded();
    await picker.fill(species!);
    const speciesOption = page.getByRole('option', {
      name: species!,
      exact: true,
    });
    await assertTouchable(speciesOption);
    await picker.press('Escape');
    await expect(speciesOption).toBeHidden();

    const persistedQuery = new URL(page.url()).search;
    await expect(
      matching
        .getByRole('article')
        .first()
        .getByText('Incineroar', { exact: true })
    ).toBeVisible();
    await expect(
      matching
        .getByRole('article')
        .first()
        .getByText('Rillaboom', { exact: true })
    ).toBeVisible();

    const detailLink = matching
      .getByRole('article')
      .first()
      .getByRole('link')
      .first();
    const detailHref = await detailLink.getAttribute('href');
    expect(detailHref).toBeTruthy();
    const detailUrl = new URL(detailHref!, page.url()).href;
    await detailLink.scrollIntoViewIfNeeded();
    await detailLink.click();
    await expect(page).toHaveURL(detailUrl);
    await expect(
      page.getByRole('heading', { name: 'Results & sources' })
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Back to teams', exact: true })
      .click();
    await expect.poll(() => new URL(page.url()).search).toBe(persistedQuery);
    await expect(
      page.getByRole('button', { name: 'Clear filters' })
    ).toBeEnabled();
    await expect(
      page.getByRole('region', { name: 'Incineroar constraints' })
    ).toBeVisible();
  }

  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/?regulation=M-C&sort=priority');
  const countLive = page.locator('.browse-results-header [aria-live="polite"]');
  const defaultCount = ((await countLive.textContent()) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const memberSpecies = await page
    .getByRole('region', { name: 'Matching teams' })
    .getByRole('article')
    .first()
    .getByRole('list', { name: 'Team members' })
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => item.querySelector('p')?.textContent?.trim() ?? '')
    );
  expect(new Set(memberSpecies).size).toBe(6);
  for (const name of memberSpecies) await addPokemonFilter(page, name);

  const picker = page.getByRole('combobox', { name: 'Add Pokémon filter' });
  await expect(picker).toBeDisabled();
  const removes = page.getByRole('button', { name: /^Remove / });
  await expect(removes).toHaveCount(6);
  for (let index = 0; index < 6; index++)
    await assertTouchable(removes.nth(index));

  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll('member').length)
    .toBe(0);
  await expect(picker).toBeEnabled();
  await expect(removes).toHaveCount(0);
  await expect(
    page
      .getByRole('region', { name: 'Matching teams' })
      .getByRole('article')
      .first()
  ).toBeVisible();
  await expect(countLive).toHaveText(defaultCount);
});

test('result counts swap in place without moving the results shell', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const header = page.locator('.browse-results-header');
  const live = header.locator('[aria-live="polite"]');
  const count = header.locator('.browse-count');
  const number = header.locator('.browse-count-number');
  const current = number.locator('span[data-count]').first();
  const animated = header.locator(
    '.browse-count-incoming, .browse-count-outgoing'
  );
  const label = (value: number) => (value === 1 ? 'team' : 'teams');

  const readCount = async () => {
    const text = ((await live.textContent()) ?? '').replace(/\s+/g, ' ').trim();
    const match = /^(\d+) (team|teams)$/.exec(text);
    expect(match, `count announcement: ${JSON.stringify(text)}`).toBeTruthy();
    return Number(match![1]);
  };
  const settled = async () => {
    await expect(animated).toHaveCount(0);
    await expect(number.locator('span')).toHaveCount(1);
  };
  const geometry = () =>
    page.evaluate(() => {
      const headerElement = document.querySelector('.browse-results-header');
      const slot = document.querySelector('.browse-count-number');
      const results = document.querySelector('.browse-results');
      if (!headerElement || !slot || !results)
        throw new Error('Results shell geometry is incomplete.');
      return {
        header: headerElement.getBoundingClientRect().toJSON(),
        slot: slot.getBoundingClientRect().toJSON(),
        resultsTop: results.getBoundingClientRect().top,
      };
    });
  const expectStable = async (
    baseline: Awaited<ReturnType<typeof geometry>>
  ) => {
    const next = await geometry();
    expectWithin(next.header.top, baseline.header.top);
    expectWithin(next.header.left, baseline.header.left);
    expectWithin(next.header.width, baseline.header.width);
    expectWithin(next.slot.width, baseline.slot.width);
    expectWithin(next.resultsTop, baseline.resultsTop);
  };
  await expect(header).toBeVisible();
  await expect(count).toHaveAttribute('aria-hidden', 'true');
  await expect(header.locator('[aria-live]')).toHaveCount(1);
  expect(await animated.count()).toBe(0);
  await settled();
  const initial = await readCount();
  await expect(live).toHaveText(`${initial} ${label(initial)}`);
  expect(await current.innerText()).toBe(String(initial));
  const baseline = await geometry();

  await addPokemonFilter(page, 'Incineroar');
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll('member').length)
    .toBe(1);
  const filtered = await readCount();
  expect(filtered).toBeLessThan(initial);
  await expect(live).toHaveText(`${filtered} ${label(filtered)}`);
  expect(await current.innerText()).toBe(String(filtered));
  await settled();
  await expectStable(baseline);

  // Slow the count animation so clearing the filters provably interrupts it.
  await page.addStyleTag({
    content:
      '.browse-count-incoming, .browse-count-outgoing { animation-duration: 3s !important; }',
  });
  await addPokemonFilter(page, 'Rillaboom');
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll('member').length)
    .toBe(2);
  const narrower = await readCount();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll('member').length)
    .toBe(0);
  await expect(number.locator('.browse-count-outgoing')).toHaveAttribute(
    'data-count',
    String(narrower)
  );
  await expect(current).toHaveAttribute('data-count', String(initial));
  await expect(live).toHaveText(`${initial} ${label(initial)}`);
  await settled();
  await expectStable(baseline);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(header).toBeVisible();
  expect(await animated.count()).toBe(0);
  await settled();
  const reducedInitial = await readCount();
  expect(await current.innerText()).toBe(String(reducedInitial));
  await addPokemonFilter(page, 'Incineroar');
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll('member').length)
    .toBe(1);
  const reducedFiltered = await readCount();
  expect(reducedFiltered).toBeLessThan(reducedInitial);
  expect(await current.innerText()).toBe(String(reducedFiltered));
  await expect(live).toHaveText(`${reducedFiltered} ${label(reducedFiltered)}`);
  expect(await animated.count()).toBe(0);
  await settled();
  await expectStable(baseline);
});
