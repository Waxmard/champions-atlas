import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';

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

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

export default defineConfig({
  define: {
    __LOCAL_IMAGE_ASSETS__: JSON.stringify(
      Object.fromEntries([
        ...readLocalImages('sprites'),
        ...readLocalImages('items'),
      ])
    ),
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
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
