# Champion's Atlas

Champion's Atlas is a mobile-friendly Pokémon Champions doubles team browser and
editor combining multiple published sources, without claiming legality validation.
It uses SvelteKit and TypeScript, daisyUI with Tailwind CSS, bits-ui primitives,
and locally bundled Nunito Variable.

## Development

Use the Node 24 LTS environment selected by mise. Install dependencies and start
the development server with:

```sh
mise install      # Install the project's Node runtime.
npm ci            # Install locked dependencies and Lefthook Git hooks.
npm run dev       # Start the local development server.
```

Run the local CI checks and browser suites with:

```sh
make ci                           # Run lint, formatting, line-limit, types, build, and Node tests.
npx playwright install chromium webkit # Install browser test prerequisites.
npm run test:e2e:smoke             # Run critical desktop and mobile browser checks.
npm run test:e2e                   # Run the full browser suite.
```

`npm test` requires a build first. Both browser commands build their own
Firebase-disabled bundle with a deterministic catalog fixture; they do not change
the generated catalog or normal production builds. CI runs smoke coverage on pull
requests and pushes to `main`. Select **Actions → CI → Run workflow** for the full
browser suite. Deployment workflows run independently of CI; see
[Firebase deployment and sync](docs/firebase.md) for hosting.

Format files or serve a built app with:

```sh
npm run format    # Format project files.
npm run preview   # Serve the production build locally.
```

## Layout

| Path          | What                                                  |
| ------------- | ----------------------------------------------------- |
| `src/routes/` | Pages and global styles                               |
| `src/lib/`    | Components, team logic, and generated catalog         |
| `scripts/`    | Catalog import, enrichment, and maintenance commands  |
| `test/`       | Node tests and built-app smoke checks                 |
| `e2e/`        | Desktop and mobile browser tests                      |
| `static/`     | App icons and cached Pokémon assets                   |
| `docs/`       | Product behavior, data sources, and deployment guides |

## Catalog

The generated catalog is ignored by Git. `npm run dev`, `npm run build`, and
`npm run typecheck` import it when missing and validate existing teams against the
checked-in regulation rosters before reuse. An ineligible catalog triggers a
cached import without forcing a YouTube recrawl. A failed rebuild preserves the
previous file and exits unsuccessfully. A clean checkout needs network access
for the initial import unless source files are already cached. The built app
uses the bundled snapshot without fetching source data at runtime.

A full refresh replaces historical records that sources change or remove.
Offline imports require cached source files and do not disable asset downloads.
Choose the import mode with:

```sh
npm run import:catalog           # Refresh the active slice and retain eligible history.
REFRESH=1 npm run import:catalog # Rebuild all history from current sources.
OFFLINE=1 npm run import:catalog # Replay cached sources.
```

See [data sources and ranking limits](docs/data-sources.md) for source admission,
active and historical records, cache freshness, partial-paste retention, assets,
and preview failure policy.

### YouTube credentials

Enable YouTube Data API v3 in a Google Cloud project and restrict an API key to
that API. Do not apply browser-referrer restrictions to this server-side key.
Add it as the `YOUTUBE_API_KEY` GitHub Actions secret accessible to the production
and preview environments. Both deployment workflows stop before import when the
secret is empty. Never store the key in `.env`.

On macOS, store the key in Keychain; this command prompts for the value without
placing it in shell history:

```sh
security add-generic-password -s champions-atlas:youtube-api-key -a "$USER" -T "" -w
```

Load the key at the point of use and request a complete channel-history scan with:

```sh
export YOUTUBE_API_KEY="$(security find-generic-password -s champions-atlas:youtube-api-key -a "$USER" -w)"
CHECK_SHEET=1 YOUTUBE_REFRESH=1 npm run import:catalog # Refresh sources and scan all configured channel histories.
```

See the [source freshness policy](docs/data-sources.md#freshness-and-scheduling)
for completed snapshot reuse, complete crawls, keyless and offline operation, and
scan failures, including the stricter YouTube rule in preview.

## Using the app

Browse by Pokémon and set filters; filters, sorting, and position survive opening
a team and returning. **Wishlist** bookmarks catalog teams without adding them
to **My teams**. Choose **Use this team**, or import a complete six-member
[Showdown team](https://play.pokemonshowdown.com/teambuilder) through
**Add custom team** in **My teams**.

Edit saved sets, compare them with their immutable original, restore changes, and
export current team text. On catalog team details, **Published paste text** preserves
the published text, while **Copy team** and **Copy published sets** use the enriched
set export. If clipboard access is unavailable, the actual copied text appears in
a selectable field. A source video can establish a team's sharing date, but not
a tournament result. Edited teams never gain new rental codes, and legality
remains unverified. **Record in-game set** and **Record all in-game sets**
explicitly record committed sets as snapshots: they change Atlas only, never
Pokémon Champions. Team edits do not update those snapshots.

Saving requires browser storage; clearing origin storage removes local saved
data. With Firebase configured, Google sign-in is required and syncs saved teams,
their originals, and current-set snapshots across devices. Without configuration,
the app runs local-only. Browse preferences remain device-local.

See the [product specification](docs/product-spec.md) for editing, restoration,
export, and snapshot contracts. Read [Firebase deployment and sync](docs/firebase.md)
for rules-before-client releases, security, and recovery operations.

## Documentation

| Authority                                               | Covers                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| [Product specification](docs/product-spec.md)           | Agreed product behavior and future scope                       |
| [Data sources and ranking limits](docs/data-sources.md) | Catalog admission, evidence, ranking, assets, and cache policy |
| [Firebase deployment and sync](docs/firebase.md)        | Hosting, authentication, sync, release safety, and recovery    |
