# Repository guide

Champion's Atlas is a SvelteKit app using TypeScript, shadcn-svelte, and Tailwind.
Read `docs/product-spec.md` before changing product behavior.

## Commands

- `npm ci`: install locked dependencies and local hooks.
- `npm run dev`: start the development server when requested.
- `npm run lint`: ESLint, including Svelte template rules.
- `npm run format`: format with Prettier.
- `npm run typecheck`: Svelte compiler and TypeScript diagnostics.
- `npm run build`: production build.
- `npm test`: smoke-test the built app; run a build first.
- `make ci`: lint, formatting, type checking, build, and smoke test.

## Layout and conventions

- Routes and global styles live in `src/routes`.
- Editable shadcn components live in `src/lib/components/ui`.
- The build smoke test uses `.mjs` so Svelte's source type-check does not follow
  its imports into compiled output.
- Use Svelte 5 runes and strict TypeScript.
- Follow mw-kit, except use ESLint with its Svelte plugin and Prettier with its
  Svelte/Tailwind plugins instead of Biome. Full Svelte diagnostics take priority
  over a single-tool lint/format setup.
- Add UI components only when used. Keep app state local; cloud sync is deferred.
- Preserve filters and browsing position when introducing team navigation.
- Never run git add, commit, or push, publish packages, or deploy automatically.
