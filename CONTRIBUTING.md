# Contributing to Champion's Atlas

Thanks for contributing. This guide covers how a change flows from a branch to a release.

## Branching

`main` is the default and target branch — branch off the latest `main`, never push to it
directly. Every change lands through a pull request.

```sh
git switch main && git pull
git switch -c feat/short-description
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`.
`feat:` → minor, `fix:` → patch, `!`/`BREAKING CHANGE:` → major. `docs`/`chore`/`refactor`/`test`
are used as normal. These types drive automated versioning (see Deploys & Releases).

## Pull Requests

Always open one — even for small changes.

- **Squash on merge.** The branch's WIP commits collapse into a single commit on `main`,
  so the **squashed title and body must be the real, conventional message** — that line is
  what release tooling reads.
- **Reference the ticket.** If the change closes or relates to a ticket, add `#<ticketnum>`
  to the description so the PR links back to the issue.
- **Keep it focused.** One logical change per PR keeps review and the changelog clean.

## Review & Approval

A [CODEOWNER](.github/CODEOWNERS) is auto-requested on every PR. This is currently a solo
repo and the branch ruleset requires 0 approvals, so that request is routing rather than a
blocking gate — the bot-first review (`pr-review-toolkit`) runs before any human pass.

## Deploys & Releases

On every push to `main`, release automation reads the conventional commits since the last
tag, bumps the version, updates `CHANGELOG.md`, and tags the release
([release-please](.github/workflows/release-please.yml)). This is why commit hygiene
matters: every commit on `main` is read by the release tooling.

Deployment runs on push to `main` after the checks pass. See `docs/firebase.md` for hosting.
