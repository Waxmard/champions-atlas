import { expect, test } from '@playwright/test';

test('multi-Pokémon item filters survive details, Back, Forward, and reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
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
    await expect(
      cards.nth(i).getByText('Sitrus Berry', { exact: true })
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
  await page.getByRole('link', { name: 'Back to teams' }).click();
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
