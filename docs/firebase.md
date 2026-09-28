# Firebase deployment and sync

Champion's Atlas builds to a static single-page application (SPA) and deploys to
Firebase Hosting, and it syncs saved teams through Cloud Firestore. With the
`VITE_FIREBASE_*` variables the app requires Google sign-in: an unauthenticated
visitor is redirected to `/login` and cannot reach the team browser until signed
in. Without the variables it runs local-only and never initializes the Firebase
SDK, because it cannot authenticate at all.

## Projects

| Purpose           | Project ID             | Project number | Firestore                  |
| ----------------- | ---------------------- | -------------- | -------------------------- |
| Production        | `champions-atlas`      | 287669775623   | `(default)`, `us-central1` |
| Preview and local | `champions-atlas-test` | 809995612901   | `(default)`, `us-central1` |

Both projects use the Blaze plan and Firestore in native mode. The Firestore
location is permanent. `.firebaserc` defaults to `champions-atlas-test`; the
workflows pass `--project` explicitly, so only local commands use the default.

## Data model

A signed-in user owns one document at `users/{uid}` with validated `teams` and
`updatedAt: serverTimestamp()`. `firestore.rules` allows access only when
`request.auth.uid` matches the document ID. Older documents may still contain
`activeTeamId` and `browse`; the app ignores them and removes them on the next
saved-team write. Filters, navigation, and the active team stay device-local.

The app listens for server changes and reconciles saved teams in Firestore
transactions. Sequential saves update the same team ID without making copies.
When two devices independently change the same team before receiving each
other's change, the last server-accepted save keeps the original ID and the
displaced edited version becomes a separate `(recovered)` team. A deletion
counts as an edit. Offline saves stay on the device until a later connection,
save, or **Retry sync**. Sync never truncates teams to fit the 50-team limit; if
reconciliation needs more room, it stops and leaves both versions intact.

The existing `champions-atlas:teams:v1` key remains the working copy. The
per-account cache lives at `champions-atlas:sync:v2:{projectId}:{uid}` with its
baseline and local saved teams, while `champions-atlas:sync-owner:v2` tracks
which account owns the working copy. First sign-in adopts existing local teams
without trusting the old last-push marker. When a pre-existing cloud team has
the same ID but different content, the cloud copy keeps that ID and the local
copy is recovered, because historical edit order cannot be inferred. Signing out
preserves the account cache, and no migration clears browser storage.

## Secrets and continuous integration

The Firebase workflows read five secrets from GitHub environments:
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and `FIREBASE_TOKEN`.
release-please reads one repository secret instead, because that job declares no
environment: `RELEASE_PLEASE_TOKEN`.

| Environment  | Project                | Values                                               |
| ------------ | ---------------------- | ---------------------------------------------------- |
| `production` | `champions-atlas`      | that project's web app config, plus `FIREBASE_TOKEN` |
| `preview`    | `champions-atlas-test` | that project's web app config, plus the same token   |

Create `FIREBASE_TOKEN` with `npx firebase-tools login:ci`, using an account that
owns both projects. The build inlines the four `VITE_FIREBASE_*` values, so each
environment must build with its own project's config.

Create `RELEASE_PLEASE_TOKEN` as a fine-grained personal access token for this
repository with **Contents: Read and write** and **Pull requests: Read and
write**, then store it as a repository secret. The workflow needs a token other
than `GITHUB_TOKEN` so that merging the release pull request triggers the
`push`-triggered workflows.

- A push to `main` runs `deploy-prod.yml`, which deploys Hosting and
  `firestore.rules` to `champions-atlas`.
- A pull request labeled `deploy-preview` runs `deploy-preview.yml`, which
  deploys the rules and a Hosting preview channel to `champions-atlas-test`, then
  comments the channel URL on the pull request.
  The `deploy-preview` label must exist on the repository (`gh label create deploy-preview`); without it the job silently no-ops.
- A push to `main` also runs `release-please.yml`, which opens or updates a
  release pull request that bumps `package.json` and writes `CHANGELOG.md`. The
  workflow merges that pull request once the required status checks pass, then
  tags the release.

Deploy by hand with:

```sh
npx firebase-tools deploy --only hosting,firestore:rules --project champions-atlas
```

## Local development

1. Print the test project's web app config and copy the four values:

   ```sh
   npx firebase-tools apps:list WEB --project champions-atlas-test
   npx firebase-tools apps:sdkconfig WEB <appId> --project champions-atlas-test
   ```

2. Put them in `.env.local`, which is gitignored, then run `npm run dev` and sign
   in with Google.
3. Deploy the rules to the test project once, or sync fails with a permission
   error:

   ```sh
   npx firebase-tools deploy --only firestore:rules --project champions-atlas-test
   ```

### Test sync without a cloud project

The app connects to the Firebase Emulator Suite only in a development build with
`VITE_FIREBASE_EMULATORS=1`, the project ID `demo-champions-atlas`, and a
loopback hostname, so a production build always talks to the configured project.
Point the emulator ports at an isolated demo project and start the dev server:

```sh
./node_modules/.bin/firebase emulators:start --only auth,firestore --project demo-champions-atlas
VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-champions-atlas.firebaseapp.com VITE_FIREBASE_PROJECT_ID=demo-champions-atlas VITE_FIREBASE_APP_ID=demo-app VITE_FIREBASE_EMULATORS=1 npm run dev -- --host 127.0.0.1 --port 5199 --strictPort
```

The emulator serves `firestore.rules` from the repository root. Sign in with a
test account; there is no bypass for real accounts. `npm run build:e2e` blanks
the `VITE_FIREBASE_*` values, so it never reaches an emulator.

## Sign-in domains

Sign-in opens a Google popup, and falls back to a full-page redirect when a
browser blocks the popup. Firebase rejects the attempt with
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

`hosting:channel:deploy` adds each preview channel's domain to the project's
authorized domains, so preview sign-in needs no manual change.

## SPA routing

Hosting rewrites every path to `/index.html`, so deep links such as `/teams/<id>`
resolve on the client. The rewrite serves the shell with a 200 status, so a
missing team renders the 404 page without an HTTP 404 status.
