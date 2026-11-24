import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const flaggedLines = async (eslint, filePath, lines) => {
  const [result] = await eslint.lintText(lines.join('\n'), { filePath });
  return result.messages
    .filter((message) => message.ruleId === 'local/no-comments')
    .map((message) => message.line);
};

test('no-comments flags narration and suppressions but keeps the keep-list', async () => {
  const eslint = new ESLint();
  const js = [
    '#!/usr/bin/env node',
    '// note',
    'const a = /\\/\\//.test("//x"); // ponytail: ok',
    '/* see https://x.y/1 */',
    '// eslint-disable-next-line no-empty',
    '// @ts-expect-error https://x.y',
    'export const u = `a // b`, v = a;',
  ];
  const svelte = [
    '<script lang="ts">',
    '  // one',
    '  const r = 1;',
    '</script>',
    '',
    '<!-- two -->',
    '<!-- prettier-ignore -->',
    '<p>{/* three */ r}</p>',
    '<!-- svelte-ignore a11y_missing_attribute -->',
    "<p>don't // flag</p>",
    '',
    '<style>',
    '  /* four */',
    '  p {',
    '    background: url(https://x.y/z.png);',
    '  }',
    '</style>',
  ];
  assert.deepEqual(
    await flaggedLines(eslint, 'scripts/sync-stats.mjs', js),
    [2, 5, 6]
  );
  assert.deepEqual(
    await flaggedLines(eslint, 'src/lib/components/Disclosure.svelte', svelte),
    [2, 6, 8, 9, 13]
  );
});
