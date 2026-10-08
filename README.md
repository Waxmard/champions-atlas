# Champion's Atlas

Find your next Pokémon Champions doubles team.

A personal-first, mobile-friendly team browser that combines Pokémon and set
filters with regulation-aware result ordering. Browse without a team in mind,
find teams around a preferred core, and keep your current teams locally.

The browser includes a VGCPastes M-C/M-B snapshot, combined Pokémon and set
filters, credential-based result ordering, and team details. Filters, sorting, and
browsing position survive opening a team and returning. Saved teams, similarity
comparison, and set-text editing work locally. Legality validation and PWA
installation remain unimplemented. See
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
invalid links, saving, comparison, editing, and export against the production build.
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
npm run import:x
```

`npm run import:x` is the only step that contacts X: it fills the ignored
`.cache/catalog/x-posts.json` post index from FxTwitter search and post lookups,
and writes the ignored `src/lib/data/team-posts.json` evidence plus mirrored
screenshots in `static/posts/`. The catalog import then admits X posts that link
a Champions paste without fetching anything itself.

The importer caches source files in `.cache/catalog`; `REFRESH=1` refreshes
spreadsheet metadata. `OFFLINE=1` requires cached files. `PASTE_LIMIT` controls
how many recent teams to fetch when explicitly set; by default every team gets
full paste details. Already loaded compatible sets survive partial imports.
Species and items are available for every imported team; moves, abilities, and
spreads require an enriched paste. Unknown details never satisfy a filter.
Imports replace the catalog atomically. Invalid spreadsheet data fails the
import. Individual paste failures are reported on the team and in importer output;
compatible previous sets are retained, otherwise details remain unknown.
Pokémon sprites and 24px item icons are cached under ignored `static/` folders
during catalog bootstrap. Missing or invalid images fail independently without
changing catalog data; item names remain visible when icons are unavailable.

Preview imports request live source refreshes with `CHECK_SHEET=1` and enable
`ALLOW_STALE_SOURCE_CACHE=1`. If a refresh fails with an eligible transient HTTP
or network error, the importer warns and reuses validated raw source cache,
including spreadsheet CSVs. Existing request retries remain unchanged.
Missing, unreadable, invalid, or oversized fallback
cache still fails the source load. Fresh validation and cache-write failures stay
fatal; mandatory-source failures stop the import without replacing the catalog.
Production, CI, and local imports remain strict unless you explicitly set this
flag. It does not change offline behavior or impose a cache age limit.

See [data sources and ranking limits](docs/data-sources.md) for source
interpretation, ranking, and catalog freshness.

## Save, compare, and edit

Open a catalog team and choose **Use this team**, or choose **Add custom team**
in **My teams** and paste a complete six-Pokémon export from
[Pokémon Showdown Teambuilder](https://play.pokemonshowdown.com/teambuilder).
Custom imports require an item, ability, nature, EVs, and four unique moves for
every Pokémon. They have no published result claims; legality is unverified.

Select a field on a saved team card to edit its set. Completed text saves on blur
or Enter; selections and suggestions save immediately when the whole set is
valid. Changed EV spreads must total 66 points. **Done** saves valid pending input
and closes the editor; **Close** offers to discard only invalid or failed-write
input. Earlier autosaves remain saved. There is no separate Apply step.
**Advanced set text** replaces the set explicitly. Structured edits retain
nicknames and supported untouched set lines. Unknown values are never guessed.

Expand **Original & history** to compare your current team with the original and
restore the original, including name, sets, and roster order. **Restore original
set** changes only that slot and is unavailable when it would duplicate a
Pokémon or exceed the replacement Mega limit. Whole-team restoration does not
change the saved ID or source history.

Original source metadata is kept when saving a catalog team and shown as evidence
for the original, not the edited version. Older saved teams show only metadata
they retained. Custom teams show their starting team without public source claims.
Original field and complete EV/nature suggestions lead the corresponding lists;
other saved-team spreads and catalog spreads follow without duplicate pairs.
Benchmark answers and **Speed tiers** retain their existing mechanics and limits.

**Copy team text** exports current sets, normalizing EVs out of 32 and omitting
IVs, level, and Tera Type for Pokémon Champions. Unknown fields are omitted.
Edited teams do not receive a new rental code. Saved copies survive reload and
catalog refreshes on the same browser origin; clearing browser storage removes
them. Saving requires available browser storage. Only unsaved input prompts
before navigation. Browse filters and position remain device-local.

When Firebase is configured, Google sign-in synchronizes saved teams and their
originals across devices. Without configuration the app runs local-only. See
[Firebase deployment and sync](docs/firebase.md) for the per-team data model and
the rules-before-client release requirement.

## Stack

- Svelte 5, SvelteKit, strict TypeScript.
- daisyUI with Tailwind CSS, bits-ui primitives, locally bundled Inter font.
- ESLint with Svelte rules, Prettier with Svelte and Tailwind plugins, svelte-check.
- mise, Lefthook, GitHub Actions, Dependabot following mw-kit conventions.

ESLint and Prettier are the agreed exception to mw-kit's Biome default for
Svelte-specific support. UI components are editable under `src/lib/components/ui`.
Internal links passed to Button must use SvelteKit's `resolve()` at the call site.

TypeScript stays on 6.0.3 until svelte-check and typescript-eslint support
TypeScript 7. Their current peer dependency ranges exclude version 7.

Deployment uses `@sveltejs/adapter-static` to build a static SPA that Firebase
Hosting serves. See [Firebase deployment and sync](docs/firebase.md).
