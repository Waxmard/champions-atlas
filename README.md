# Champion's Atlas

Find your next Pokémon Champions doubles team.

A personal-first, mobile-friendly team browser that combines Pokémon and set
filters with regulation-aware result ordering. Browse without a team in mind,
find teams around a preferred core, and keep your current teams locally.

The browser includes a VGCPastes M-C/M-B snapshot, combined Pokémon and set
filters, preliminary result ordering, and team details. Filters, sorting, and
browsing position survive opening a team and returning. Local current-team
storage, legality validation, and PWA installation remain unimplemented. See
[the product specification](docs/product-spec.md) for agreed behavior and milestones.

## Development

```sh
mise install
npm ci
npm run dev
```

Use the Node 24 LTS environment selected by mise. `npm ci` installs Lefthook hooks.

```sh
make ci
```

This runs ESLint, Prettier verification, `svelte-check`, the production build,
and importer/filter/ranking tests plus a server-rendering smoke test.
`npm test` requires a build first. Browser checks run separately and in CI:

```sh
npx playwright install chromium
npm run test:e2e
```

These cover desktop and mobile filtering, details, Back/Forward, reload, and
invalid links against the production build.
Use `npm run format` to format files and `npm run preview` to serve a built app.

## Catalog

The generated catalog is ignored by Git. `npm run dev`, `npm run build`, and
`npm run typecheck` automatically import it when missing, then reuse it unchanged.
A clean checkout needs network access for the initial import unless source files
are already cached. The built app uses the bundled snapshot without fetching
source data at runtime.

Regenerate or refresh explicitly with:

```sh
npm run import:catalog
REFRESH=1 npm run import:catalog
OFFLINE=1 npm run import:catalog
```

The importer caches source files in `.cache/catalog`; `REFRESH=1` refreshes
spreadsheet metadata. `OFFLINE=1` requires cached files. `PASTE_LIMIT` controls
how many recent teams get full paste details (default 12, maximum 100).
Species and items are available for every imported team; moves, abilities, and
spreads require an enriched paste. Unknown details never satisfy a filter.
Imports replace the catalog atomically only after validation succeeds.

See [data sources and ranking limits](docs/data-sources.md). No scheduled
refresh or additional source integration is configured.

## Stack

- Svelte 5, SvelteKit, strict TypeScript.
- shadcn-svelte (Vega), Tailwind CSS, locally bundled Inter font.
- ESLint with Svelte rules, Prettier with Svelte and Tailwind plugins, svelte-check.
- mise, Lefthook, GitHub Actions, Dependabot following mw-kit conventions.

ESLint and Prettier are the agreed exception to mw-kit's Biome default for
Svelte-specific support. UI components are editable under `src/lib/components/ui`.
Internal links passed to Button must use SvelteKit's `resolve()` at the call site.

TypeScript stays on 6.0.3 until svelte-check and typescript-eslint support
TypeScript 7. Their current peer dependency ranges exclude version 7.

Deployment is undecided; the scaffold retains SvelteKit's automatic adapter.
