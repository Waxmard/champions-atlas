import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';

test('static build emits the SPA shell and the bundled catalog chunk', async () => {
  const html = await readFile(
    new URL('../build/index.html', import.meta.url),
    'utf8'
  );
  assert.match(html, /\/_app\/immutable\/entry\/start\.[^"'\s]+\.js/);
  const chunks = new URL('../build/_app/immutable/chunks/', import.meta.url);
  const sizes = await Promise.all(
    (await readdir(chunks)).map(
      async (f) => (await stat(new URL(f, chunks))).size
    )
  );
  assert.ok(
    Math.max(0, ...sizes) > 1_000_000,
    'catalog chunk (≥1 MB) missing from build output'
  );
});
