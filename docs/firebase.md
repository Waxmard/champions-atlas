# Firebase deployment and sync

Champion's Atlas bundles a static single-page app in its iOS app and distributes
builds through TestFlight. It syncs saved teams and current Pokémon set snapshots
through Cloud Firestore. With the `VITE_FIREBASE_*` variables the app requires
Google sign-in: an unauthenticated user is redirected to `/login` and cannot
reach the team browser until signed in. Without the variables it runs local-only
and never initializes the Firebase SDK.

## Projects

| Purpose           | Project ID             | Project number | Firestore                  |
| ----------------- | ---------------------- | -------------- | -------------------------- |
| Production        | `champions-atlas`      | 287669775623   | `(default)`, `us-central1` |
| Preview and local | `champions-atlas-test` | 809995612901   | `(default)`, `us-central1` |

Both projects use the Blaze plan and Firestore in native mode. The Firestore
location is permanent. `.firebaserc` defaults to `champions-atlas-test`; the
workflows pass `--project` explicitly, so only local commands use the default.

## iOS app

The Capacitor iOS project bundles the static app and uses native Google Sign-In.
Use a local Xcode install as the daily iPhone update loop; use TestFlight for
distribution and release checks. Local installs require Xcode 26 or later, the
existing paid Apple signing team, and a physical iPhone.

### One-time configuration

The checked-in iOS client ID, callback scheme, and Web OAuth client ID use
`champions-atlas-test`. Keep these values, the bundle ID
`com.maxwellward.championsatlas`, and the native sign-in bridge for local installs.
Use the matching Firebase web app configuration and automatic signing with the
paid team, not a Personal Team. If Xcode or iOS requests it, pair and trust the
iPhone and enable Developer Mode; a restart may be required.

For a different Firebase project, register an iOS app with the same bundle ID in
Firebase **Project settings** → **Your apps**, enable Google under
**Authentication** → **Sign-in method**, and download `GoogleService-Info.plist`.
Update all three public values in `ios/App/App/Info.plist` together:

- `GIDClientID`: the iOS `CLIENT_ID` from `GoogleService-Info.plist`.
- `GIDServerClientID`: the same project's Web OAuth client ID below.
- `CFBundleURLTypes`: an array containing a dictionary with a
  `CFBundleURLSchemes` array containing the iOS `REVERSED_CLIENT_ID`.

Set the four `VITE_FIREBASE_*` build variables to the same project's web app
configuration. Shell variables override `.env.local`. If the API key is not
already in Keychain, add it without putting the value in shell history:

```sh
security add-generic-password -s champions-atlas:firebase-api-key -a "$USER" -T "" -w
```

When switching Firebase projects, replace the stored key with that project's key:

```sh
security add-generic-password -s champions-atlas:firebase-api-key -a "$USER" -T "" -U -w
```

The Google Web OAuth client IDs are public configuration:

| Project                | Web OAuth client ID                                                        |
| ---------------------- | -------------------------------------------------------------------------- |
| `champions-atlas`      | `287669775623-7fjtghdh0utvroqlpjhgajhhaso7tpev.apps.googleusercontent.com` |
| `champions-atlas-test` | `809995612901-5t9ikagsdo6qqaug8rnpavg4ng7t72ri.apps.googleusercontent.com` |

### Install updates on an iPhone

Before switching between TestFlight and a local install, confirm your teams and
current sets have synced under the existing account. Preserve unsynced work with
the app's export controls. Do not uninstall the app or clear its storage. Both
installs use the same bundle identity: a local install replaces TestFlight, and
a later TestFlight install switches it back. Check your data on the device after
switching; preservation of every local record is not guaranteed. If Xcode rejects
the replacement, stop and preserve your data before deciding how to proceed.

1. Load the API key at build time. Keychain asks for approval; if it blocks, approve
   the prompt rather than copying the key to a file.

   ```sh
   export VITE_FIREBASE_API_KEY="$(security find-generic-password -s champions-atlas:firebase-api-key -a "$USER" -w)"
   ```

2. Build the normal app, sync its assets into the native project, and open Xcode:

   ```sh
   make ios
   ```

   This does not install the app; press **Run** in Xcode after selecting your
   physical iPhone and checking the scheme and signing settings below.

   The normal build reuses a valid catalog; UI changes do not require a full
   catalog or enrichment refresh. Do not use `build:e2e`, blank Firebase
   variables, a fixture catalog, the development server as the device asset
   source, or the TestFlight archive/upload script for this install.

3. In Xcode, select the **App** scheme and your physical iPhone. Under
   **Product** → **Scheme** → **Edit Scheme** → **Run** → **Info**, select
   **Release** for **Build Configuration** and turn off **Debug executable**.
   Verify automatic signing uses the paid team.
4. With the iPhone online, press **Run** in Xcode. Sign in if needed, then confirm
   your existing teams and current sets are available or restored through the
   same account. A first launch may need online certificate verification.
5. Disconnect the phone, stop or close Xcode, and launch from the home-screen
   icon. The bundled app requires no `server.url`, live-reload connection, or Mac
   process. Repeat the build, sync, and install steps only when you want an update.

Local signing expires; an installation is not permanent. Check the actual
profile's `ExpirationDate` in Xcode's signing/profile details or by read-only
decoding the built app's `embedded.mobileprovision`. Do not export signing private
keys. Launch online before leaving the Mac.

Verify the device behavior before relying on it away from the Mac. With Xcode
closed and the phone disconnected, open Browse and My teams, make a reversible set
edit, and confirm it survives a force-quit and phone restart. With Wi-Fi off and
cellular on, check sign-in and sync. After an online sign-in, enable Airplane Mode,
force-quit and reopen the app, check Browse and saved teams, and confirm a
reversible edit survives relaunch and syncs to a second signed-in client after
reconnecting. Restore the edit. Also check that canceling sign-in leaves the login
screen idle and signing out returns to the account gate. Offline startup depends
on the persisted sign-in session and must be checked on the device; report an
authentication block rather than assuming it works.

## Data model

A signed-in user owns a manifest at `users/{uid}` containing exactly
`schemaVersion: 2`, ordered `teamIds`, and `updatedAt: serverTimestamp()`. Each
`users/{uid}/teams/{teamId}` document contains one complete validated saved team,
including its immutable original and provenance. The
team's `id` matches its document ID. The manifest holds at most 50 unique IDs;
the client rejects IDs that Firestore cannot safely represent without changing
local identities. Filters, navigation, and the active team stay device-local.

Transactions read the manifest and every listed child before writing. Missing,
malformed, or mismatched children stop sync without replacing local teams or the
sync baseline. Changed teams, removed children, and the replacement manifest
commit atomically. An unchanged v2 result writes nothing. The parent listener
requests reconciliation; it never adopts partial snapshots directly. Per-team
documents avoid Firestore's 1 MiB document limit for combined histories, though
each team must still fit that limit.

An absent parent becomes an empty v2 manifest even when you have no teams. A
legacy parent with a valid `teams` array migrates in one transaction: the client
writes every resulting child and replaces the parent, removing legacy `teams`,
`activeTeamId`, and `browse` fields. It does not keep a legacy mirror. Unsupported
schema versions stop sync and preserve existing data.

Rules permit only the owner to read the parent and its team children. Parent
creation requires the v2 manifest shape; legacy owner updates remain allowed
only while both the stored and requested parent lack `schemaVersion`. After
migration, rules reject legacy overwrites and downgrades. Parent deletion is
denied; removing all teams writes an empty manifest. Child writes require the
document ID to match the saved-team ID. Other nested paths remain inaccessible.

The app listens for server changes and reconciles saved teams in Firestore
transactions. Sequential saves update the same team ID without making copies.
When two devices independently change the same team before receiving each
other's change, the last server-accepted save keeps the original ID and the
displaced edited version becomes a separate `(recovered)` team. A deletion
counts as an edit. Offline saves stay on the device until a later connection,
save, or **Retry sync**. Sync never truncates teams to fit the 50-team limit; if
reconciliation needs more room, it stops and leaves both versions intact.

## Current Pokémon sets

Current sets use a separate registry, not team documents. The device stores the
working registry under `champions-atlas:current-sets:v1`; the per-account cache
adds `setsBase` and `setsLocal` to the existing v2 account record. Each entry
contains a member snapshot keyed by Browse identity. Mawile and Mawile-Mega
share an ID, while ordinary Floette and Floette-Eternal use different IDs.
Each registry supports at most 1,500 sets.

The registry manifest lives at
`users/{uid}/pokemonSetState/manifest` and contains exactly
`schemaVersion: 1`, sorted unique `setIds`, and `updatedAt:
serverTimestamp()`. Each listed `users/{uid}/pokemonSets/{id}` document
contains exactly `{id, member}`, with `id` matching the document ID. Owner rules
allow reads and valid writes to these paths; deletes are denied. A missing
manifest means an empty registry; a new account creates its empty manifest.
Malformed manifests, missing or invalid children, and mismatched IDs stop sync
without replacing either local working store or either sync baseline.

Sync merges whole entries by ID. Independent species changes are retained; when
devices explicitly save competing snapshots for the same species, the last
server-accepted save wins. Current-set conflicts do not create recovered teams.
Transactions stage at most 350 changed set documents and drain any remainder in
later passes. The separate manifest and collection leave the existing v2 team
manifest unchanged, so older team-only clients cannot erase the current-set
index. Current sets have no delete operation; team deletion does not affect them.

Account switching validates and caches both local stores, then replaces both
under the existing owner guard. If the switch fails, the client restores both
original storage values and the former owner; if rollback fails, it marks the
owner interrupted. Sign-out preserves per-account snapshots. The current-set
manifest listener and same-owner storage events request reconciliation rather
than replacing local state.

Cloud set members are validated against their original document IDs before
normalization. When a canonical slot and a legacy Mega-Z duplicate both exist,
the canonical slot is kept and the duplicate is dropped without a prompt, in the
working registry, the account cache, and cloud data alike. The removal is
permanent: no backup, download, or archive key is kept. A lone legacy slot
normalizes to its canonical identity with its member unchanged, and entries whose
original id already matches the canonical id are never dropped. If distinct
legacy ids collapsed onto one canonical id, reading fails with the existing read
error instead of guessing.
Deferred local edits keep their canonical ID if the old Mega-Z ID no longer
matches the member. A later sync pass writes the canonical child without
blocking on that temporary local/cloud ID difference.

Sync then writes the canonical child and a manifest that no longer lists the
dropped legacy id. Old child documents remain unchanged and unlisted because the
rules deny deletion. Without a connection, staging stops before any write and
reports that cloud in-game sets need a connection.

Deploy the updated rules for the current-set paths with the normal rules
deployment. Until deployment, access to those paths fails visibly, while valid
local saves remain available for retry. The emulator setup below tests rules
locally and does not deploy them.

Reconciliation continues while a set editor is open, but its mounted form does
not refresh underneath you. If another device changes or deletes that team,
the next save is rejected against the latest local working copy and retains
your unsaved input. Close and reopen the editor to use the updated team.

The existing `champions-atlas:teams:v1` key remains the working copy. The
per-account cache lives at `champions-atlas:sync:v2:{projectId}:{uid}` with its
baseline and local saved teams, while `champions-atlas:sync-owner:v2` tracks
which account owns the working copy. First sign-in adopts existing local teams
without trusting the old last-push marker. When a pre-existing cloud team has
the same ID but different content, the cloud copy keeps that ID and the local
copy is recovered, because historical edit order cannot be inferred. Signing out
preserves the account cache, and no migration clears browser storage.

## Secrets and continuous integration

Deploy updated Firestore rules before or with a new client. Until those rules are
deployed, child access fails visibly; successful local saves remain available
for **Retry sync**. After a v2 migration, old clients fail their legacy read
validation instead of clearing local storage. Install an updated client to use
the new format. Local Xcode installs and emulator checks do not deploy rules.

The TestFlight workflow uses the GitHub `preview` environment and
`champions-atlas-test`. It reads `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_APP_ID`, and `FIREBASE_TOKEN` from that environment. Create
`FIREBASE_TOKEN` with `npx firebase-tools login:ci` using an account with access
to the test project. The build inlines the four Firebase configuration values.
The same environment supplies `YOUTUBE_API_KEY`, `TYPESAFE_API_KEY`,
`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`,
`APPLE_CERTIFICATE_P12_BASE64`, and `APPLE_CERTIFICATE_PASSWORD`.

The release-please workflow reads the repository secret `RELEASE_PLEASE_TOKEN`
instead, because its job declares no environment.

Create `RELEASE_PLEASE_TOKEN` as a fine-grained personal access token for this
repository with **Contents: Read and write** and **Pull requests: Read and
write**, then store it as a repository secret. The workflow needs a token other
than `GITHUB_TOKEN` so that merging the release pull request triggers the
`push`-triggered workflows.

- A push to `main` runs `deploy-testflight.yml`. To run it manually, select
  **Actions** → **Deploy TestFlight** → **Run workflow**, choose a branch, and
  optionally select **Rebuild all historical regulations**. A feature-branch
  push or pull request label does not trigger the workflow.
- The workflow builds the app, deploys Firestore rules to
  `champions-atlas-test`, and uploads the signed iOS build to TestFlight. It runs
  independently of CI and does not wait for CI checks.
- After upload, wait for Apple to process the build. Accept the TestFlight
  invitation if needed, open TestFlight on your iPhone, and install or update
  Champion's Atlas when the build becomes available. An upload does not install
  the build automatically.
- A [local Xcode install](#install-updates-on-an-iphone) skips Apple processing
  and TestFlight installation but does not deploy Firestore rules.
- A push to `main` also runs `release-please.yml`, which opens or updates a
  release pull request that bumps `package.json` and writes `CHANGELOG.md`. The
  workflow merges that pull request once the required status checks pass, then
  tags the release.

## Local development

1. Print the test project's web app config and copy the four values:

   ```sh
   npx firebase-tools apps:list WEB --project champions-atlas-test
   npx firebase-tools apps:sdkconfig WEB <appId> --project champions-atlas-test
   ```

2. Set the public configuration values in your shell or `.env.local`. Store the
   API key in Keychain and load it as shown in [iOS app](#ios-app), then run
   `npm run dev` and sign in with Google.
3. Deploy the rules to the test project once, or sync fails with a permission
   error:

   ```sh
   npx firebase-tools deploy --only firestore:rules --project champions-atlas-test
   ```

### Test sync without a cloud project

The app connects to the Firebase Emulator Suite only in a development build with
`VITE_FIREBASE_EMULATORS=1`, the project ID `demo-champions-atlas`, and a
loopback hostname, so a production build always talks to the configured project.
The repository `firebase.json` does not configure emulator ports. Create a
temporary config outside the repository with the repository's absolute rules
path; this example uses Auth on port 9099 and Firestore on port 8080:

```json
{
  "firestore": { "rules": "/absolute/path/to/champions-atlas/firestore.rules" },
  "emulators": {
    "auth": { "host": "127.0.0.1", "port": 9099 },
    "firestore": { "host": "127.0.0.1", "port": 8080 },
    "ui": { "enabled": false }
  }
}
```

Start the emulators with that temporary config and run the development server
against the isolated demo project:

```sh
./node_modules/.bin/firebase emulators:start --only auth,firestore --project demo-champions-atlas --config /tmp/champions-atlas-firebase.json
VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-champions-atlas.firebaseapp.com VITE_FIREBASE_PROJECT_ID=demo-champions-atlas VITE_FIREBASE_APP_ID=demo-app VITE_FIREBASE_EMULATORS=1 npm run dev -- --host 127.0.0.1 --port 5199 --strictPort
```

The emulator serves `firestore.rules` from the temporary config. Sign in with a
test account; there is no bypass for real accounts. `npm run build:e2e` blanks
the `VITE_FIREBASE_*` values, so it never reaches an emulator.

## Sign-in domains

Browser sign-in opens a Google popup and falls back to a full-page redirect when
the browser blocks it. Firebase rejects the attempt with
`auth/unauthorized-domain` unless the page's hostname is listed under
**Authentication** → **Settings** → **Authorized domains**. The default list
covers `localhost`, the project's `firebaseapp.com` and `web.app` domains, and,
in these projects, `127.0.0.1`. Opening the dev server by LAN IP fails until you
add that hostname.

## Manual console steps

Two steps have no CLI equivalent:

1. Enable Google sign-in. Open **Authentication**, select **Sign-in method**, and
   enable **Google** in each project. The Identity Toolkit API rejects the
   provider without an OAuth client ID, which only the console provisions.
2. Accept the Firebase terms of service for the account, which happens when you
   first create or add a project in the console.
