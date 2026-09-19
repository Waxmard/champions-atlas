# Firebase deployment and sync

Champion's Atlas builds to a static single-page application (SPA) and deploys to
Firebase Hosting, and it syncs saved teams through Cloud Firestore. Without the
`VITE_FIREBASE_*` variables the app runs local-only: it hides the sign-in
controls and never initializes the Firebase SDK.

## Projects

| Purpose           | Project ID             | Project number | Firestore                  |
| ----------------- | ---------------------- | -------------- | -------------------------- |
| Production        | `champions-atlas`      | 287669775623   | `(default)`, `us-central1` |
| Preview and local | `champions-atlas-test` | 809995612901   | `(default)`, `us-central1` |

Both projects use the Blaze plan and Firestore in native mode. The Firestore
location is permanent. `.firebaserc` defaults to `champions-atlas-test`; the
workflows pass `--project` explicitly, so only local commands use the default.

## Data model

A signed-in user owns one document at `users/{uid}`:

| Field          | Type             | Purpose                                              |
| -------------- | ---------------- | ---------------------------------------------------- |
| `teams`        | `SavedTeam[]`    | Saved teams, validated before it replaces local data |
| `activeTeamId` | `string \| null` | Selected team                                        |
| `browse`       | `string \| null` | Browse filters and sort as a URLSearchParams string  |
| `updatedAt`    | timestamp        | `serverTimestamp()`                                  |

`firestore.rules` allows a read or write only when `request.auth.uid` matches the
document ID.

Saving pushes the whole document; opening the app pulls it. When a pull changes
local storage the app reloads once per tab session, so rendered pages pick up the
pulled teams and filters. The once-per-session bound (a `sessionStorage` flag) is
load-bearing: Firestore does not guarantee nested-map key order, so an unbounded
reload can re-trigger `pullNow` forever. Signing out clears the flag so a later
sign-in can pull-and-reload again. There is no realtime listener and no conflict
resolution: the last push wins.

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
