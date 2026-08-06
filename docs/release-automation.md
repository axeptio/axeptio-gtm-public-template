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

Pull requests are merged with a **merge commit** (squash and rebase merges are disabled on this
repository), so every commit in the branch lands on `master` — and every one of them is parsed by
release-please to work out the next version. Merge commits themselves are ignored. Tidy the branch
history before merging; `Lint commits` will reject a non-conventional commit anywhere in it.

## Workflows

- **`.github/workflows/commitlint.yml`** (`Lint commits`) — runs on every PR with two jobs:

  | Job | What it checks |
  | --- | --- |
  | `Validate commit messages` | every commit in the PR, against `commitlint.config.mjs` — these are the ones release-please reads. Also rejects a branch that merges `master` into itself, which makes release-please prune commits from the changelog |
  | `Validate PR title` | the PR title is a valid Conventional Commit — and, as below, a release trigger in its own right |

  **The release PR is exempt from the merge check.** release-please keeps its PR
  current by merging `master` into its own branch every time `master` moves, so
  without an exemption the guard would block every release — `Validate commit
  messages` is a required status check. That is safe for the reason the guard
  exists: the branch holds only generated files, carries no contributor commits
  that could be pruned, and its changelog is computed before the merge. The
  exemption is scoped to `axeptio-bot` **and** a `release-please--` branch name,
  so it cannot be claimed by naming a branch to match.

  The gallery sync PR needs no exemption: `chore/sync-metadata-<tag>` is built
  from a fresh `master` checkout with a single commit and contains no merges.

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

### Which commit types publish

In release-please a **visible** `changelog-sections` entry is also a **releasing** one: any
commit of that type cuts a release. That is easy to miss, because the setting reads as though it
only controls the changelog.

It has bitten twice:

- `docs`, `refactor` and `build` were visible, so a README-only PR released **v2.1.2** — a gallery
  version whose `template.tpl` was byte-identical to v2.1.1's, published with the notes
  `Release v2.1.2`. All three are now hidden and non-releasing; none of them can change what a
  gallery user sees, since a refactor that changed behaviour would be a `fix`.
- `fix(ci):` has type `fix`, so a CI-only change bumped the version and put its subject on the
  public listing in v2.0.1. Scope does not affect releasability — only the type does.

`perf` and `revert` stay visible and releasing: both genuinely reach users, and a silent revert
would be worse than a verbose changelog.

**The pull request title is also a release trigger.** The repository is set to
`merge_commit_message: PR_TITLE`, so GitHub writes the PR title into the *body* of the merge
commit, and release-please parses that body like any other commit:

```
subject: Merge pull request #64 from axeptio/docs/gtm-vhj-readme
body:    docs: expand the README and correct the gallery description   <- parsed
```

Two consequences, both deliberate and kept:

- Every PR contributes **its commits plus its title**, so a PR of three commits yields four
  changelog lines. The extra line is usually a vaguer restatement of one of the commits.
  `update-metadata-version.mjs` dedupes only exact matches, so a near-duplicate survives into the
  gallery notes.
- A PR **titled** `fix:` cuts a release even when none of its commits do.

This is why `Validate PR title` is a required status check and not cosmetic hygiene. The
alternative — setting `merge_commit_message: BLANK` — would make the title inert and remove the
duplicate, at the cost of the title no longer being reviewed as a release artifact. That trade was
considered and declined.

`changeNotes` are filtered separately, by section, in `update-metadata-version.mjs` — only
breaking changes, Features, Bug Fixes, Performance Improvements and Reverts reach the gallery. If
a release ever contains nothing from those sections, the notes fall back to `Release <tag>`, which
is the signal that something released which should not have.

## Authentication

The workflow authenticates as **`axeptio-bot`**, not the default `GITHUB_TOKEN`. The
organisation forbids `GITHUB_TOKEN` from creating or approving pull requests, so release-please
cannot open its release PR without a real bot account. That is what broke the first attempt
(run `27350014158`).

`master` also enforces **signed commits**, so the metadata sync commit is GPG-signed with the
bot's key before it is pushed.

### The release PR is re-signed too

release-please authenticates with a PAT, and the release commit it creates through the API is
**not signed**. Since `master` moved from classic branch protection to rulesets, that makes the
release PR unmergeable by anyone: `required_signatures` lives on the `Compliance` ruleset, which
has **no bypass actor**, and rulesets grant no implicit admin bypass. v2.1.2 shipped only because
classic protection still gave admins one; v2.1.3 was the first release to meet the rule as
written, and it was blocked.

Adding the bot to `Compliance`'s bypass would be the wrong fix — **bypass is per-ruleset, not
per-rule**, so it would also exempt the bot from `required_status_checks` and undo the guarantee
that the sync PR cannot merge while `Validate gallery contract` is failing.

Instead the `Sign the release PR commit` step rebuilds the release branch as a single commit
signed with the bot's GPG key, replaying `VERSION`, `CHANGELOG.md` and
`.release-please-manifest.json` onto `master`. The branch carries nothing else and release-please
rewrites it from scratch each run, so replacing it wholesale is safe — the same pattern the sync
PR branch uses. It also drops the `Merge branch 'master' into release-please--…` commits the
action leaves behind, which is why those need the `Lint commits` exemption only as a backstop.

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
