# Release Automation

This repository uses the canonical Axeptio release automation workflow (ENG-11756).

## Workflow

Two GitHub Actions workflows automate releases, split across branches because their
triggers are read from the branch they live on:

- **`create-release-pr.yml`** (lives on `develop`, not this branch) — runs on schedule
  (`0 8 * * 1`, every Monday 08:00 UTC) and `workflow_dispatch`. Creates a
  `release/YYYY-MM-DD` branch from `develop`, runs git-cliff to compute the next
  version and generate `CHANGELOG.md`, then opens a PR targeting `master`.

- **`auto-release.yml`** (lives on `master`) — fires on push to `master` (i.e. when
  the release PR is merged). Resolves the version from `CHANGELOG.md`, creates a
  GPG-signed tag, publishes a GitHub Release, and opens a sync-back PR from
  `master` → `develop`.

Both workflows run as `axeptio-bot` (via `BOT_GITHUB_TOKEN`), not the default
`GITHUB_TOKEN` — this org blocks the default token from creating/approving PRs, so a
real bot account is required.

## Gate

The file `.github/release-automation-enabled` must exist to activate both workflows.
Remove it to pause automation without touching the workflow files.

## Versioning

There is no `package.json` in this repo, so no file-based version bump happens.
`CHANGELOG.md` and the GitHub Release tag are the source of truth for the current
version (the old `VERSION` file has been removed).

## Secrets required

| Secret | Source |
| -------------------- | ------------ |
| `BOT_GITHUB_TOKEN` | Org-level |
| `BOT_GPG_PRIVATE_KEY` | Org-level |
| `BOT_EMAIL` | Org-level |

## Canonical spec

- Reusable workflows: `axeptio/tech-scripts` → `.github/workflows/`
- Templates: `axeptio/tech-scripts` → `github-action-templates/`
- Full spec: Linear ENG-11756
