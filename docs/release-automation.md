# Release Automation

Releases are driven by [Conventional Commits](https://www.conventionalcommits.org/) and
[release-please](https://github.com/googleapis/release-please). Every merge to `master`
maintains a release PR; merging that PR cuts the release and publishes the new version to
the GTM Community Template Gallery history.

## Branch flow

```
feature branch ──PR──> master ──> release PR ──> tag + GitHub Release ──> metadata.yaml synced
                       (default)
```

`master` is both the default branch and the release branch. There is no `develop`: a second
long-lived branch bought nothing but drift, and while it was the default branch it silently
made release-please open its release PR against the wrong branch.

Pull requests are **squash-merged**, so the PR title becomes the commit message on `master` —
which is what release-please parses to work out the next version.

## Workflows

- **`.github/workflows/commitlint.yml`** (`Lint commits`) — runs on every PR with two jobs:

  | Job | What it checks |
  | --- | --- |
  | `Validate PR title` | the PR title is a valid Conventional Commit (it becomes the squash commit) |
  | `Validate commit messages` | every commit in the PR, against `commitlint.config.mjs` |

  This is what makes automated versioning possible: `fix:` → patch, `feat:` → minor,
  `feat!:` / `BREAKING CHANGE:` → major.

- **`.github/workflows/release.yml`** (`Release`) — fires on push to `master`. release-please
  scans the commits since the last release, works out the next version, and opens (or updates)
  a release PR that bumps `VERSION`, updates `CHANGELOG.md` and bumps
  `.release-please-manifest.json`. Merging that PR tags the commit and publishes a GitHub
  Release.

  When — and only when — a release was just published (`release_created == 'true'`), the same
  workflow then runs `scripts/update-metadata-version.mjs` and pushes a signed
  `chore(metadata): sync version history for <tag>` commit. That is the step that reaches the
  gallery (see below).

## GTM Gallery version history

The GTM Community Template Gallery publishes template versions from the `versions:` list in
`metadata.yaml` — one entry per published version, each a commit SHA plus change notes, in
reverse chronological order.

`scripts/update-metadata-version.mjs` keeps that list in sync. It takes `RELEASE_TAG` and
`RELEASE_SHA` from the release-please outputs, derives `changeNotes` from the top section of
`CHANGELOG.md`, and prepends the entry directly under the `versions:` key. It uses only Node
built-ins and edits the file textually, so the license header and existing entries are
preserved byte for byte.

**Do not add `versions:` entries by hand.** The one thing still manual is publishing the new
version in the gallery UI once the entry has landed.

## Authentication

The workflow authenticates as **`axeptio-bot`**, not the default `GITHUB_TOKEN`. The
organisation forbids `GITHUB_TOKEN` from creating or approving pull requests, so release-please
cannot open its release PR without a real bot account. That is what broke the first attempt
(run `27350014158`).

`master` also enforces **signed commits**, so the metadata sync commit is GPG-signed with the
bot's key before it is pushed.

| Secret | Used for | Source |
| --------------------- | ------------------------------------ | --------- |
| `BOT_GITHUB_TOKEN` | release PR, release, metadata push | Org-level |
| `BOT_GPG_PRIVATE_KEY` | signing the metadata sync commit | Org-level |

## Why not the canonical Axeptio release automation?

Axeptio's canonical release automation (ENG-11756) is a pair of thin caller workflows —
`create-release-pr.yml` and `auto-release.yml` — that call reusable workflows hosted in
`axeptio/tech-scripts`.

**They cannot be used here.** This repository is **public** and `axeptio/tech-scripts` is
**internal**. GitHub only allows a public caller repository to use reusable workflows from
**public** repositories, so both callers failed at access time with `workflow was not found`
before running a single job. See
[Access to reusable workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/reusable-workflows).

`release-please-action` is a public action, so it has no such restriction. The sibling public
repository `axeptio/axeptio-sgtm-public-template` uses the same approach, and this repo's setup
is deliberately kept aligned with it.
