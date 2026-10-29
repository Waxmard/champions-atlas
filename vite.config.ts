import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { withE2eCatalog } from './e2e/catalog-fixture.ts';

function readLocalImages(directory: 'sprites' | 'items'): [string, true][] {
  try {
    return readdirSync(new URL(`./static/${directory}/`, import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => [`${directory}/${entry.name}`, true]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export default defineConfig({
  define: {
    __LOCAL_IMAGE_ASSETS__: JSON.stringify(
      Object.fromEntries([
        ...readLocalImages('sprites'),
        ...readLocalImages('items'),
      ])
    ),
  },
  plugins: [
    process.env.E2E_CATALOG_FIXTURE === '1' && {
      name: 'e2e-catalog-fixture',
      apply: 'build',
      enforce: 'pre',
      transform(code, id) {
        if (
          id.split('?')[0] !==
          fileURLToPath(new URL('./src/lib/data/catalog.json', import.meta.url))
        )
          return;
        return JSON.stringify(withE2eCatalog(JSON.parse(code)));
      },
    },
    tailwindcss(),
    sveltekit({
      adapter: adapter({ fallback: 'index.html' }),
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
    }),
  ],
  build: {
    // ponytail: catalog.json (1170 teams) ships as one ~4 MB data chunk for
    // static/offline use; split members/paste by route if payload ever matters.
    chunkSizeWarningLimit: 5000,
    rolldownOptions: {
      checks: { bundlerTimings: false },
    },
  },
});
