import { expect, test } from '@playwright/test';
import {
  expectDetailsSubView,
  expectMovesSubView,
  openWorkbench,
} from './workbench-helpers';

test('custom ability typed value survives Escape and Close saves valid input', async ({
  page,
}) => {
  await openWorkbench(page);
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit Weavile ability', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expectDetailsSubView(editor);
  const ability = editor.getByLabel('Ability', { exact: true });
  await ability.fill('Glitch Drive');
  await ability.press('Escape');
  await expect(ability).toHaveValue('Glitch Drive');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    weavile
      .getByRole('button', { name: 'Edit Weavile ability', exact: true })
      .getByText('Glitch Drive', { exact: true })
  ).toBeVisible();

  await weavile
    .getByRole('button', { name: 'Edit Weavile ability', exact: true })
    .click();
  const reopened = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expectDetailsSubView(reopened);
  await reopened.getByLabel('Ability', { exact: true }).fill('Another');
  await reopened.getByLabel('Ability', { exact: true }).press('Escape');
  await reopened.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    weavile
      .getByRole('button', { name: 'Edit Weavile ability', exact: true })
      .getByText('Another', { exact: true })
  ).toBeVisible();
});

test('move Enter preserves typed value and Tab Enter selects an exact suggestion', async ({
  page,
}) => {
  await openWorkbench(page);
  const weavile = page.getByRole('region', {
    name: 'Weavile set',
    exact: true,
  });
  await weavile
    .getByRole('button', { name: 'Edit Weavile moves', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Edit Weavile set',
    exact: true,
  });
  await expectMovesSubView(editor);

  const move2 = editor.getByLabel('Move 2', { exact: true });
  await move2.fill('Pro');
  await move2.press('Enter');
  await expect(move2).toHaveValue('Pro');
  await expect(editor).toBeVisible();

  const move1 = editor.getByLabel('Move 1', { exact: true });
  const move3 = editor.getByLabel('Move 3', { exact: true });
  const move4 = editor.getByLabel('Move 4', { exact: true });
  await move1.fill('Ice');
  const options = editor
    .getByLabel('Move suggestions', { exact: true })
    .getByRole('button');

  await move1.focus();
  await page.keyboard.press('Tab');
  await expect(
    editor.getByRole('button', { name: 'Clear move 1' })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(move2).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    editor.getByRole('button', { name: 'Clear move 2' })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(move3).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    editor.getByRole('button', { name: 'Clear move 3' })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(move4).toBeFocused();
  await move4.fill('Ice');
  await expect(options.first()).toBeVisible();
  const text = await options.first().textContent();
  if (text === null) throw new Error('move suggestion has no text');
  const chosen = text.replace(/Original/g, '').trim();
  await page.keyboard.press('Tab');
  await expect(
    editor.getByRole('button', { name: 'Clear move 4' })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(options.first()).toBeFocused();
  await options.first().press('Enter');
  await expect(move4).toHaveValue(chosen);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
});
