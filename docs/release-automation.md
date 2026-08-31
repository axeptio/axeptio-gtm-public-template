# Release Automation

Releases are driven by [Conventional Commits](https://www.conventionalcommits.org/) and
[release-please](https://github.com/googleapis/release-please). Every merge to `develop`
maintains a release PR; merging that PR cuts the release. **Cutting a release does not publish
it** — that happens when `develop` is promoted to `master`.

## Branch flow

```
feature branch ──PR──> develop ──> release PR ──> tag + GitHub Release ──> metadata.yaml synced
                          │                                                    (on develop)
                          │
                          └──promotion PR──> master ──> GTM Community Template Gallery
                                             (default)
```

- **`develop` is the integration and release branch.** Feature PRs target it, release-please
  targets it, and `VERSION`, `CHANGELOG.md`, `.release-please-manifest.json` and `metadata.yaml`
  are all written there.
- **`master` is the published branch, and stays the *default* branch.** The gallery reads
  `metadata.yaml`, `template.tpl` and `LICENSE` from the repository's default branch, so making
  `develop` the default would publish every release the moment it was cut and promotion would mean
  nothing. It also silently mis-targeted release-please the last time this repository had two
  long-lived branches, which is why `release.yml` now pins `target-branch: develop` instead of
  relying on the default.
- Only `develop` (a promotion) and `hotfix/*` may open a PR against `master`. The
  `Only develop and hotfixes may target master` step in `Lint commits` enforces it.

Pull requests are merged with a **merge commit** (squash and rebase merges are disabled on this
repository), so every commit in the branch lands on `develop` — and every one of them is parsed by
release-please to work out the next version. Merge commits themselves are ignored. Tidy the branch
history before merging; `Lint commits` will reject a non-conventional commit anywhere in it.

### `master` is never merged back into `develop`

This is the one rule that is easy to break and expensive to undo.

`Lint commits` fails any PR whose branch contains a merge whose *merged-in* parent is already on
the base branch (see `Reject merges of the base branch into the PR branch`, below). A promotion PR
passes that guard because it carries only feature merges, whose merged-in parents are feature
branches. **One `master → develop` merge commit would put a `master` commit on the merged-in side
of `develop`'s history and fail every promotion PR from then on.**

Nothing needs a back-merge anyway: every generated file is produced on `develop` and travels
downstream with the promotion, so `develop` is never behind. If a `hotfix/*` branch has to land on
`master` directly, cherry-pick the same change onto `develop` through a normal PR — do not merge.

## Promoting a release

Publishing is manual and deliberate.

1. Run the **Promote develop to master** workflow (`.github/workflows/promote.yml`,
   `workflow_dispatch`). It opens — or refreshes — the `develop → master` PR with the title
   `chore(release): promote develop to master` and a body listing the tags about to go live.
   Equivalent by hand:
   `gh pr create --base master --head develop --title 'chore(release): promote develop to master'`
2. Review it. `Validate gallery contract`, `Validate commit messages`, `Validate PR title` and
   `Test template` all run; the gallery contract check is the one that matters, because it is the
   last gate before the template reaches real GTM containers.
3. Merge it with a merge commit. That push to `master` is the publication: Google polls the
   repository and the new version appears in the gallery within 2 to 3 days. `GTM live container
   e2e` also fires, exercising the promoted `template.tpl` in a real container.

Nothing deletes `develop` on merge: `delete_branch_on_merge` is on, but the `Compliance` ruleset's
`deletion` rule protects the branch, so GitHub skips it.

## Workflows

- **`.github/workflows/commitlint.yml`** (`Lint commits`) — runs on every PR with two jobs:

  | Job | What it checks |
  | --- | --- |
  | `Validate commit messages` | every commit in the PR, against `commitlint.config.mjs` — these are the ones release-please reads. Also rejects a branch that merges its base branch into itself, which makes release-please prune commits from the changelog, and rejects a PR into `master` that is not a promotion or a `hotfix/*` |
  | `Validate PR title` | the PR title is a valid Conventional Commit — and, as below, a release trigger in its own right |

  **The release PR is exempt from the merge check.** release-please keeps its PR
  current by merging `develop` into its own branch every time `develop` moves, so
  without an exemption the guard would block every release — `Validate commit
  messages` is a required status check. That is safe for the reason the guard
  exists: the branch holds only generated files, carries no contributor commits
  that could be pruned, and its changelog is computed before the merge. The
  exemption is scoped to `axeptio-bot` **and** a `release-please--` branch name,
  so it cannot be claimed by naming a branch to match.

  The gallery sync PR needs no exemption: `chore/sync-metadata-<tag>` is built
  from a fresh `develop` checkout with a single commit and contains no merges.

  The promotion PR needs no exemption either — see
  [`master` is never merged back into `develop`](#master-is-never-merged-back-into-develop).

  This is what makes automated versioning possible: `fix:` → patch, `feat:` → minor,
  `feat!:` / `BREAKING CHANGE:` → major.

- **`.github/workflows/release.yml`** (`Release`) — fires on push to `develop`, with
  `target-branch: develop` pinned explicitly. release-please scans the commits since the last
  release, works out the next version, and opens (or updates) a release PR that bumps `VERSION`,
  updates `CHANGELOG.md` and bumps `.release-please-manifest.json`. Merging that PR tags the
  commit and publishes a GitHub Release.

  When — and only when — a release was just published (`release_created == 'true'`), the same
  workflow then opens the signed `chore(metadata): sync version history for <tag>` PR against
  `develop`. That entry is what the gallery eventually reads — but only once `develop` reaches
  `master` (see below).

- **`.github/workflows/promote.yml`** (`Promote develop to master`) — `workflow_dispatch` only.
  Opens the `develop → master` PR that publishes. It never merges.

## GTM Gallery version history

The GTM Community Template Gallery publishes template versions from the `versions:` list in
`metadata.yaml` — one entry per published version, each a commit SHA plus change notes, in
reverse chronological order.

`scripts/update-metadata-version.mjs` keeps that list in sync. It takes `RELEASE_TAG` and
`RELEASE_SHA` from the release-please outputs, derives `changeNotes` from the top section of
`CHANGELOG.md`, and prepends the entry directly under the `versions:` key. It uses only Node
built-ins and edits the file textually, so the license header and existing entries are
preserved byte for byte.

**Do not add `versions:` entries by hand.**

**There is one manual publish step, and only one: merging the promotion PR.** The sync PR only
stages the entry on `develop`. Merging the `develop → master` promotion *is* the publication:
Google polls the repository's default branch and the new version appears in the gallery
[typically within 2 to 3 days](https://developers.google.com/tag-platform/tag-manager/templates/gallery).
There is no author dashboard and no gallery UI to push a version from — which is also why the
template has no install counts, ratings or review-status notifications (ENG-13164), and why a
contract breach delists silently instead of failing a submission.

The only manual submissions are the **initial listing**, and a **re-submission if the template is
delisted** for breaking the gallery contract. Neither happens on a normal release.

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
  changelog lines. The extra line is usually a vaguer restatement of one of the commits. It stays
  in `CHANGELOG.md`; `update-metadata-version.mjs` keeps it out of the gallery notes by dropping
  the bullets whose SHA git reports as a merge commit.
- A PR **titled** `fix:` cuts a release even when none of its commits do.

This is why `Validate PR title` is a required status check and not cosmetic hygiene. The
alternative — setting `merge_commit_message: BLANK` — would make the title inert and remove the
duplicate, at the cost of the title no longer being reviewed as a release artifact. That trade was
considered and declined.

`changeNotes` are filtered separately in `update-metadata-version.mjs`, by three rules: **section**
(only breaking changes, Features, Bug Fixes, Performance Improvements and Reverts reach the
gallery), **scope** (`ci`, `build`, `chore`, `docs` and `test` never do, even under Bug Fixes) and
**merge commits** (dropped when git can answer; kept, with a warning in the run log, when it
cannot — only this rule degrades, the other two are pure). What survives is rendered as plain text — the gallery shows no markdown — with the
implied `template:` scope removed. If a release ever contains nothing that passes, the notes fall
back to `Release <tag>`, which is the signal that nothing a GTM user can see reached that release
— worth a look before the sync PR is merged.

## Authentication

The workflow authenticates as **`axeptio-bot`**, not the default `GITHUB_TOKEN`. The
organisation forbids `GITHUB_TOKEN` from creating or approving pull requests, so release-please
cannot open its release PR without a real bot account. That is what broke the first attempt
(run `27350014158`).

The `Compliance` ruleset enforces **signed commits** on `master` *and* `develop`, so the metadata
sync commit is GPG-signed with the bot's key before it is pushed.

### The release PR is re-signed too

release-please authenticates with a PAT, and the release commit it creates through the API is
**not signed**. Since this repository moved from classic branch protection to rulesets, that makes
the release PR unmergeable by anyone: `required_signatures` lives on the `Compliance` ruleset, which
has **no bypass actor**, and rulesets grant no implicit admin bypass. v2.1.2 shipped only because
classic protection still gave admins one; v2.1.3 was the first release to meet the rule as
written, and it was blocked.

Adding the bot to `Compliance`'s bypass would be the wrong fix — **bypass is per-ruleset, not
per-rule**, so it would also exempt the bot from `required_status_checks` and undo the guarantee
that the sync PR cannot merge while `Validate gallery contract` is failing.

Instead the `Sign the release PR commit` step rebuilds the release branch as a single commit
signed with the bot's GPG key, replaying `VERSION`, `CHANGELOG.md` and
`.release-please-manifest.json` onto `develop`.

It is gated on a `Detect an unsigned release PR` step that asks GitHub whether an open
`release-please--*` PR exists and whether all of its commits are verified — **not** on
release-please's own `pr` output. That output is set only when the action creates or updates a PR
*in that run*, so pushing a non-releasing `ci` / `docs` / `chore` commit leaves it empty and an
already-unsigned PR would never be repaired. The verified check also means a branch that is
already signed is not force-pushed, and its checks not re-run, on every push to `develop`. The branch carries nothing else and release-please
rewrites it from scratch each run, so replacing it wholesale is safe — the same pattern the sync
PR branch uses. It also drops the `Merge branch 'develop' into release-please--…` commits the
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
