# Release Automation

Releases are driven by [Conventional Commits](https://www.conventionalcommits.org/) and
[release-please](https://github.com/googleapis/release-please). Every merge to `master`
maintains a release PR; merging that PR cuts the release.

## Workflows

- **`.github/workflows/commitlint.yml`** — runs on every PR and rejects commits that don't
  follow the Conventional Commits format. This is what makes automated versioning possible:
  `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major.

- **`.github/workflows/release.yml`** — fires on push to `master`. release-please scans the
  commits since the last release, works out the next version, and opens (or updates) a
  release PR that bumps `VERSION`, updates `CHANGELOG.md` and bumps
  `.release-please-manifest.json`. Merging that PR tags the commit and publishes a GitHub
  Release.

## Branch flow

```
feature branch ──PR──> develop ──PR──> master ──> release PR ──> tag + GitHub Release
                       (default)       (release)
```

Day-to-day work lands on `develop`. To release, open a `develop` → `master` PR and merge it;
release-please takes over from there.

> After a release, `master` is ahead of `develop` (`VERSION`, `CHANGELOG.md`,
> `.release-please-manifest.json`). Merge `master` back into `develop` so the next
> `develop` → `master` PR doesn't conflict on `CHANGELOG.md`.

## Authentication

The workflow authenticates as **`axeptio-bot`** via `BOT_GITHUB_TOKEN`, not the default
`GITHUB_TOKEN`. The organisation forbids `GITHUB_TOKEN` from creating or approving pull
requests, so release-please cannot open its release PR without a real bot account. That is
what broke the first attempt (run `27350014158`).

| Secret | Source |
| ------------------ | --------- |
| `BOT_GITHUB_TOKEN` | Org-level |

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
repository `axeptio/axeptio-sgtm-public-template` uses the same approach.

## Known gap — the GTM Gallery

The GTM Community Template Gallery publishes template versions from the `versions:` list in
`metadata.yaml` (a commit SHA plus change notes per entry). **Nothing in this flow updates
that file**, so cutting a release does not by itself publish a new version to the gallery —
`metadata.yaml` is still maintained by hand.

Tracked as `gtm-3uk` in the local beads tracker (`bd show gtm-3uk`).
