import assert from 'node:assert/strict';
import test from 'node:test';
import { Server } from '../.svelte-kit/output/server/index.js';
import { manifest } from '../.svelte-kit/output/server/manifest.js';

test('built home page renders the real catalog and source attribution', async () => {
  const server = new Server(manifest);
  await server.init({ env: {} });

  const response = await server.respond(new Request('http://localhost/'), {
    getClientAddress: () => '127.0.0.1',
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Champion's Atlas/);
  assert.match(html, /Explore teams/);
  assert.match(html, /Reg M-C/);
  assert.match(html, /Catalog snapshot/);
  assert.match(html, /href="https:\/\/docs\.google\.com\/spreadsheets\//);
});
