import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
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
  },
});
