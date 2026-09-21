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
- `npm test`: importer/filter/ranking and built-app smoke tests; build first.
- `npm run test:e2e`: desktop/mobile browser tests; build and install Playwright Chromium first.
- `npm run import:catalog`: manually regenerate the catalog; see README for cache options.
- `make ci`: lint, formatting, type checking, build, and Node tests. CI also runs browser tests.

## Layout and conventions

- Routes and global styles live in `src/routes`.
- `src/lib/data/catalog.json` is generated and ignored. Dev/build/typecheck hooks
  create it when missing; refresh explicitly with `REFRESH=1 npm run import:catalog`.
- Editable shadcn components live in `src/lib/components/ui`.
- Shared paste parsing lives in `src/lib/paste.ts`; preserve raw set lines on export.
- `src/lib/workbench.ts` owns similarity and saved-team persistence. Keep the
  original snapshot separate from edits; never overwrite unreadable saved data.
- The build smoke test uses `.mjs` so Svelte's source type-check does not follow
  its imports into compiled output.
- Use Svelte 5 runes and strict TypeScript.
- Follow mw-kit, except use ESLint with its Svelte plugin and Prettier with its
  Svelte/Tailwind plugins instead of Biome. Full Svelte diagnostics take priority
  over a single-tool lint/format setup.
- Add UI components only when used. Keep app state local; cloud sync is deferred.
- Preserve filters and browsing position when introducing team navigation.
- Never run git add, commit, or push, publish packages, or deploy automatically.

## UI design and component quality gates

- When creating new components in `src/lib/components/` or executing layout redesigns across existing views:
  - Validate template markup with `xd://mcp__designer_mcp_anti_pattern_check` (`genre: "modern-minimal"`) to detect AI styling tells, overused card containers, and visual hierarchy flaws.
  - Validate accessibility with `xd://mcp__designer_mcp_audit_accessibility` to check WCAG compliance (unlabeled inputs, missing focus rings, button text, contrast).
  - Use `xd://mcp__designer_mcp_generate_tokens` or `build_custom_tokens` when creating new color ramps.
- Omit these checks on minor styling tweaks, single-line bug fixes, or non-UI files (e.g. `src/lib/paste.ts`, data scripts, tests) to avoid token bloat and round-trip latency.
