import adapter from '@sveltejs/adapter-static';

/**
 * All SvelteKit config lives here — passing options to `sveltekit()` in
 * `vite.config.ts` makes SvelteKit ignore this file.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
  kit: { adapter: adapter({ fallback: 'index.html' }) },
  compilerOptions: {
    // Runes everywhere except dependencies.
    runes: ({ filename }) =>
      filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
  },
};

export default config;
