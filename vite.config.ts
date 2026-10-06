import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    {
      name: 'emit-build-version',
      applyToEnvironment: (environment) => environment.name === 'client',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId: process.env.VITE_BUILD_ID ?? '' }),
        });
      },
    },
  ],
  build: {
    // ponytail: catalog.json (1170 teams) ships as one ~4 MB data chunk for
    // static/offline use; split members/paste by route if payload ever matters.
    chunkSizeWarningLimit: 5000,
  },
});
