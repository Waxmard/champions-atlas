import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('static build emits an SPA shell with the immutable entry chunk', async () => {
  const html = await readFile(
    new URL('../build/index.html', import.meta.url),
    'utf8'
  );
  assert.match(html, /\/_app\/immutable\/entry\/start\.[^"'\s]+\.js/);
});
