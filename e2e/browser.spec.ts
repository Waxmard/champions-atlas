import { expect, test } from '@playwright/test';

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
  const openMobileFilters = async () => {};
  await page.goto('/');
  await openMobileFilters();
  const picker = page.getByRole('combobox', { name: 'Add Pokémon filter' });
  const incineroar = page.getByRole('option', {
    name: 'Incineroar',
    exact: true,
  });
  await expect(async () => {
    await picker.fill('Incineroar');
    await expect(incineroar).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await incineroar.click();
  await expect(picker).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Remove Incineroar', exact: true })
  ).toBeVisible();
  await picker.fill('Rillaboom');
  await expect(
    page.getByRole('option', { name: 'Rillaboom', exact: true })
  ).toBeVisible();
  await picker.press('ArrowDown');
  await picker.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Remove Rillaboom', exact: true })
  ).toBeVisible();
  await expect(picker).toHaveValue('');
  await page
    .getByRole('region', { name: 'Incineroar constraints' })
    .getByLabel('Held item')
    .selectOption('Sitrus Berry');
  await page
    .getByRole('combobox', { name: 'Sort teams' })
    .selectOption('recent');
  const query = new URL(page.url()).search;
  expect(new URLSearchParams(query).getAll('member')).toHaveLength(2);
  const cards = page
    .getByRole('region', { name: 'Matching teams' })
    .getByRole('article');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    await expect(
      cards.nth(i).getByText('Incineroar', { exact: true })
    ).toBeVisible();
    await expect(
      cards.nth(i).getByText('Rillaboom', { exact: true })
    ).toBeVisible();
  }
  await cards.first().scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  const firstName = await cards.first().getByRole('heading').innerText();
  const detailHref = await cards.first().getByRole('link').getAttribute('href');
  expect(detailHref).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath('filtered-catalog.png'),
    fullPage: false,
  });
  if (testInfo.project.use.isMobile) {
    await cards.first().getByRole('link').tap();
  } else {
    await cards.first().getByRole('link').click();
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
  await openMobileFilters();
  await expect(page).toHaveURL(
    new RegExp(`\\?${query.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  );
  await expect(
    page
      .getByRole('region', { name: 'Incineroar constraints' })
      .getByLabel('Held item')
  ).toHaveValue('Sitrus Berry');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(scroll, -1);
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstName);
  await page.goBack();
  await page.reload();
  await openMobileFilters();
  await expect(
    page.getByRole('button', { name: 'Remove Rillaboom', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Sort teams' })).toHaveValue(
    'recent'
  );
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
  const card = page
    .getByRole('region', { name: 'Matching teams' })
    .getByRole('article')
    .first();
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

  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  const scrolled = await shellBounds();
  expect(scrolled.scrollY).toBeGreaterThan(300);
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
