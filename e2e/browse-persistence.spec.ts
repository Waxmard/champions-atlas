import { expect, test, type Page } from '@playwright/test';

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
  const mobile = testInfo.project.name === 'mobile';
  const contextOptions = {
    baseURL,
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce' as const,
  };

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
