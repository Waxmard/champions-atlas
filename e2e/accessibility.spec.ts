import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import catalog from '../src/lib/data/catalog.json' with { type: 'json' };

// WCAG rule tags only: an untagged run also reports best-practice advisories that
// this app deliberately ignores, and a mixed list makes regressions hard to read.
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const seed = catalog.teams.find((team) => team.members.length === 6)!;
const memberParam = (pokemon: string) =>
  `member=${encodeURIComponent(JSON.stringify([pokemon, '', '', '']))}`;
const sixMemberFilters = seed.members
  .map((m) => memberParam(m.pokemon))
  .join('&');

const cards = (page: Page) =>
  page.getByRole('region', { name: 'Matching teams' }).getByRole('article');

async function expectNoViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    // Bits UI wraps the popup options in an inner scroll viewport that the combobox
    // input does not reference, so axe's own combobox-popup exemption (it resolves a
    // popup through `aria-controls`/`aria-owns`) never reaches it and the scroll
    // region is reported as unreachable by keyboard. Keyboard users scroll it with
    // the arrow keys, which the reachability test below asserts.
    .exclude('[data-combobox-viewport]')
    .withTags(wcagTags)
    .analyze();
  const detail = violations
    .map((violation) =>
      [
        `${violation.id} (${violation.impact}): ${violation.help}`,
        ...violation.nodes.map(
          (node) =>
            `  ${node.target.join(' >> ')} ${node.failureSummary?.replace(/\s+/g, ' ')}`
        ),
      ].join('\n')
    )
    .join('\n');
  expect(violations, `${label}\n${detail}`).toEqual([]);
}

async function openBrowse(page: Page) {
  await page.goto('/');
  // restoreBrowse canonicalizes the URL once the app is hydrated.
  await expect(page).toHaveURL(/regulation=/);
  await expect(cards(page).first()).toBeVisible();
}

test('browse results pass axe in both themes', async ({ page }) => {
  await openBrowse(page);
  await expectNoViolations(page, 'browse results (light)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectNoViolations(page, 'browse results (dark)');
});

test('phone browse passes axe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBrowse(page);
  await expectNoViolations(page, 'phone browse');
});

test('type filter popup and active filter chips pass axe', async ({ page }) => {
  await openBrowse(page);
  await page.getByRole('button', { name: /Filter by type/ }).click();
  const typeInput = page.getByRole('combobox', { name: 'Filter by type' });
  await typeInput.click();
  const fireOption = page.getByRole('option', { name: 'fire', exact: true });
  await expect(fireOption).toBeVisible();
  await expectNoViolations(page, 'type filter popup');

  await fireOption.click();
  await expect(page).toHaveURL(/type=fire/);
  await typeInput.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Remove fire type filter', exact: true })
  ).toBeVisible();
  await expectNoViolations(page, 'active filter chips');

  await page.getByRole('button', { name: 'Clear filters' }).click();
  const picker = page.getByRole('combobox', { name: 'Add Pokémon filter' });
  await picker.click();
  await picker.fill('gar');
  await expect(page.getByRole('option', { name: /^Garchomp$/ })).toBeVisible();
  await expectNoViolations(page, 'pokemon picker popup');
});

const highlightedInsidePopup = (page: Page, popupId: string) =>
  page.evaluate((id) => {
    const popup = document.getElementById(id);
    const active = popup?.querySelector('[data-highlighted]');
    if (!popup || !active) return false;
    const scroller = popup.querySelector('[data-combobox-viewport]') ?? popup;
    const box = scroller.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    return rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1;
  }, popupId);

test('combobox options stay reachable with the keyboard past the popup fold', async ({
  page,
}) => {
  await openBrowse(page);
  await page.getByRole('button', { name: /Filter by type/ }).click();
  const typeInput = page.getByRole('combobox', { name: 'Filter by type' });
  await typeInput.click();
  await expect(
    page.getByRole('option', { name: 'fire', exact: true })
  ).toBeVisible();

  // The popup shows about six options, so this walks the highlight past the fold.
  for (let step = 1; step <= 14; step += 1) {
    await typeInput.press('ArrowDown');
    expect(
      await highlightedInsidePopup(page, 'type-filter-options'),
      `highlight left the popup on ArrowDown ${step}`
    ).toBe(true);
  }
});

test('six member filters pass axe in both themes', async ({ page }) => {
  await page.goto(`/?regulation=M-C&sort=priority&${sixMemberFilters}`);
  await expect(cards(page).first()).toBeVisible();
  await expectNoViolations(page, 'six member filters (light)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectNoViolations(page, 'six member filters (dark)');
});

test('no matching teams passes axe in both themes', async ({ page }) => {
  // A species that cannot exist keeps this state deterministic.
  await page.goto(
    `/?regulation=M-C&sort=priority&${memberParam('Fakemon Test')}`
  );
  await expect(page.getByText('No matching teams')).toBeVisible();
  await expectNoViolations(page, 'no matching teams (light)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectNoViolations(page, 'no matching teams (dark)');
});

test('team detail, workbench, and set editor pass axe', async ({ page }) => {
  await page.goto(`/teams/${seed.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoViolations(page, 'team detail');

  await page
    .getByRole('button', { name: 'Use this team', exact: true })
    .click();
  await expect(page.getByLabel('Team name', { exact: true })).toBeVisible();
  await expectNoViolations(page, 'my-teams workbench');

  await page
    .getByRole('button', { name: /^Edit .* set$/ })
    .first()
    .click();
  const editor = page.getByRole('dialog');
  await expect(
    editor.getByRole('button', { name: 'Change Pokémon', exact: true })
  ).toBeVisible();
  await expectNoViolations(page, 'set editor dialog');
});
