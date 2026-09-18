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

  if (testInfo.project.name === 'mobile') {
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
  await page.screenshot({
    path: testInfo.outputPath('filtered-catalog.png'),
    fullPage: false,
  });
  await cards.first().getByRole('link').click();
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
  const response = await page.goto('/teams/not-a-team');
  expect(response?.status()).toBe(404);
});
