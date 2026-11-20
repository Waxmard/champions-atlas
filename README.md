# Champion's Atlas

Champion's Atlas is an iOS app for browsing and editing Pokémon Champions
doubles and singles teams from multiple published sources, without claiming
legality validation. Its packaged UI uses SvelteKit and TypeScript, daisyUI
with Tailwind CSS, bits-ui primitives, and locally bundled Nunito Variable and
Unbounded Variable.

## Development

Use the Node 26 LTS environment selected by mise. The development and preview
servers are local tools for the shared UI, not a supported website or PWA.
The browser harness does not initialize Firebase, authentication, or sync; use
the iPhone app to check sign-in and sync.
Install dependencies and start the loopback server with:

```sh
mise install      # Install the project's Node runtime.
npm ci            # Install locked dependencies and Lefthook Git hooks.
npm run dev       # Start the local development server.
```

Run the local CI checks with:

```sh
make ci # Run lint, formatting, line-limit, types, build, and Node tests.
```

`npm test` requires a build first. CI runs `make ci` on pull requests and
pushes to `main`, plus `npm run test:rules`, which needs Java and the Firestore
emulator. See [iOS installation and Firebase sync](docs/firebase.md#secrets-and-continuous-integration) for release delivery and configuration.

For daily iPhone updates, follow the [iPhone installation procedure](docs/firebase.md#install-updates-on-an-iphone), then run:

```sh
make ios IOS_DEVICE="Gengar Phone" # Build, install, and launch on an iPhone.
```

Format files or serve a built app with:

```sh
npm run format    # Format project files.
npm run preview   # Serve the built shared UI locally.
```

## Layout

| Path          | What                                                  |
| ------------- | ----------------------------------------------------- |
| `src/routes/` | Pages and global styles                               |
| `src/lib/`    | Components, team logic, and generated catalog         |
| `scripts/`    | Catalog import, enrichment, and maintenance commands  |
| `test/`       | Node tests and built-app smoke checks                 |
| `static/`     | Cached Pokémon assets and type badges                 |
| `docs/`       | Product behavior, data sources, and deployment guides |

The crowned-compass logo in `static/favicon.svg` is shared by the header and
sign-in page. Native app icons are in `ios/App/App/Assets.xcassets`.

## Catalog

The generated catalog is ignored by Git. `npm run dev`, `npm run build`, and
`npm run typecheck` import it when missing and validate existing teams against the
checked-in regulation rosters before reuse. An ineligible catalog triggers a
cached import without forcing a YouTube recrawl. A failed rebuild preserves the
previous file and exits unsuccessfully. A clean checkout needs network access
for the initial import unless source files are already cached. The built app
uses the bundled catalog without fetching source data at runtime. Importing an
unknown Poképaste link fetches that paste directly from Poképaste.

Species movepools are generated the same way: `npm run sync:movepools` writes
the ignored `src/lib/data/movepools.json` from each species' newest learnsets,
and the dev, build, typecheck, and test hooks generate it when missing. See
[data sources](docs/data-sources.md#species-movepools).

`npm run sync:ladder` refreshes the checked-in `src/lib/data/ladder-partners.json`
from the latest Smogon M-C doubles ladder stats and
`src/lib/data/ladder-partners-singles.json` from the `gen9championsbssregmc`
singles file. Both rank Pokémon suggestions that no close catalog team supports.

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
and import failure policy.

### YouTube credentials

Enable YouTube Data API v3 in a Google Cloud project and restrict an API key to
that API. Do not apply browser-referrer restrictions to this server-side key.
Add it as the `YOUTUBE_API_KEY` GitHub Actions secret accessible to the `preview`
environment. The TestFlight workflow stops before import when the secret is empty.
Never store the key in `.env`.

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
scan failures.

## Using the app

- **Browse** teams by Pokémon, regulation, and set filters. **Settings** holds the **Battle format** choice, **Doubles** or **Singles**. See [Discovery and browsing](docs/product-spec.md#discovery-and-browsing).
- **Saved** holds your own teams, including custom Showdown imports, and opens each in a full editor.
- **Wishlist** bookmarks catalog teams and Poképaste links, and a bookmark can move to Saved.
- Edit sets, revert them, export team text, and record in-game set snapshots.
- **Log Game Result** is a Shortcuts action that logs a win or loss from Back Tap, the Action Button, or Siri.

Saved, Wishlist, editing, snapshots, and Log Game Result are specified in [Saved teams, similarity, and editing](docs/product-spec.md#saved-teams-similarity-and-editing).

## Documentation

| Authority                                               | Covers                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| [Product specification](docs/product-spec.md)           | Agreed product behavior and future scope                       |
| [Data sources and ranking limits](docs/data-sources.md) | Catalog admission, evidence, ranking, assets, and cache policy |
| [iOS installation and Firebase sync](docs/firebase.md)  | TestFlight, authentication, sync, release safety, and recovery |

## License and contributing

MIT licensed — see [LICENSE](LICENSE). Changes land through pull requests; see
[CONTRIBUTING.md](CONTRIBUTING.md) for the branching, commit, and release flow.
[CHANGELOG.md](CHANGELOG.md) is generated by Release Please from those commits.
