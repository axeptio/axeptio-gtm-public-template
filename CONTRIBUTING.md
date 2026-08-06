# How to Contribute

We'd love to accept your patches and contributions to this project. There are
just a few small guidelines you need to follow.

## Contributions and licensing

This template is distributed under the [Apache License 2.0](./LICENSE). By
submitting a contribution you agree that it is provided under, and may be
redistributed as part of this project under, that licence.

The [Community Template Gallery](https://developers.google.com/tag-platform/tag-manager/templates/gallery)
requires the `LICENSE` file to contain **only** Apache 2.0. A template whose
licence does not match is removed from the gallery automatically, so the licence
cannot be changed while the template is distributed there.

## Code reviews

All submissions, including submissions by project members, require review. We
use GitHub pull requests for this purpose. Consult
[GitHub Help](https://help.github.com/articles/about-pull-requests/) for more
information on using pull requests.

## Testing a template change

The `___TESTS___` block in `template.tpl` holds YAML test scenarios. They run in two places from
that one definition — in the GTM UI **Tests** tab, and headlessly in CI:

```bash
npm ci
npm test
```

The runner executes the **real** `___SANDBOXED_JS_FOR_WEB_TEMPLATE___` source, so a change that
breaks the tag breaks a test. If you change template behaviour, add a scenario for it rather than a
separate test file.

Scenario **names** may only contain letters, numbers, spaces, hyphens and underscores. GTM's editor
silently refuses to save a template whose test name contains punctuation such as `.` or `/`, so the
runner fails the build on one instead of letting you discover it in the UI.

## The gallery contract

This template is published through the
[Community Template Gallery](https://developers.google.com/tag-platform/tag-manager/templates/gallery),
which imposes requirements on the repository itself — not just on the template code. Break one and
Google **silently delists the template** a couple of days later, with no notification on the pull
request and no submission-status page to check.

A CI check, `Validate gallery contract`, runs on every pull request and on pushes to `master`. Run
it yourself before touching `LICENSE`, `metadata.yaml` or `template.tpl`:

```bash
pip install pyyaml          # one-time; the script needs Python 3.7+
python3 scripts/validate-gallery.py
```

It reports every violation at once. The rules most easily broken by accident:

- **`LICENSE` must contain *only* Apache 2.0.** Not "Apache 2.0 plus a notice" — only. Changing it
  removes the template from the gallery, which is what happened in SUP-1008.
- **`___INFO___` must declare `categories`** — 1 to 3 values from Google's list, most relevant first.
- **`versions:` entries must be real commits on `master`, newest first**, with the `# Latest version`
  marker on the top entry. Never edit this list by hand; it is generated on release.

## Commit & pull request conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
to drive automated [Semantic Versioning](https://semver.org/) and changelog
generation via [release-please](https://github.com/googleapis/release-please).

A commit / PR title must follow:

```
<type>(<optional scope>): <description>
```

**Allowed types**

| Type       | Effect on version | Reaches the gallery? | Use for                                 |
| ---------- | ----------------- | -------------------- | --------------------------------------- |
| `feat`     | minor bump        | yes                  | a new feature                           |
| `fix`      | patch bump        | yes                  | a bug fix                               |
| `perf`     | patch bump        | yes                  | performance improvement                 |
| `revert`   | patch bump        | yes                  | reverting a previous commit             |
| `docs`     | none              | no                   | documentation only                      |
| `refactor` | none              | no                   | code change that isn't a fix or feature |
| `build`    | none              | no                   | build system or dependencies            |
| `test`     | none              | no                   | tests                                   |
| `ci`       | none              | no                   | CI / GitHub Actions changes             |
| `chore`    | none              | no                   | maintenance / tooling                   |

**Pick the type by who is affected, not by how big the change feels.** A release
publishes a new version to the Community Template Gallery, so `feat`/`fix`/`perf`/`revert`
should be reserved for changes a GTM user installing the tag would notice. Anything
that cannot change the tag's behaviour — a README, a CI job, a refactor — belongs in
the lower group.

Typing a CI or tooling change as `fix` is the easy mistake, because "fix" describes
almost any repair. `fix(ci):` still has type `fix`, so it bumps the version and its
subject is published on the public listing.

A breaking change is signalled by a `!` after the type (e.g. `feat!: ...`) or a
`BREAKING CHANGE:` footer, and triggers a major bump.

**Suggested scopes:** `template`, `metadata`, `docs`, `ci`.

Examples:

```
feat(template): add support for the new consent purpose
fix(template): correct the cookie expiry check
docs: clarify the import steps
```

**Important notes**

- Pull requests are merged with a **merge commit** (squash and rebase are
  disabled), so **every individual commit** lands on `master` and is parsed by
  release-please. The `Lint commits` CI check lints them all — a stray
  `wip: fixup` in your branch will fail the check, so tidy the history before
  requesting review.
- **Your PR title is released too — treat it as a commit message.** GitHub puts
  the PR title in the *body* of the merge commit, and release-please parses that
  body like any other commit. So the title:
  - adds its own line to `CHANGELOG.md`, on top of your commits, and
  - **can cut a release on its own.** A PR titled `fix: tidy up the workflow`
    publishes a patch version to the Community Template Gallery even if every
    commit inside it is `chore`, `ci` or `docs`.

  Title a PR by the *lowest-impact* type that honestly describes it, and reach
  for `feat`/`fix` only when a GTM user installing the tag would notice. This is
  why `Validate PR title` is a required check rather than cosmetic.
- Releases, `CHANGELOG.md`, git tags, GitHub Releases, and the `versions:`
  history in `metadata.yaml` are **all generated automatically**. Do not edit
  versions or the changelog by hand. See
  [docs/release-automation.md](./docs/release-automation.md).

## Community Guidelines

Please be respectful and constructive in issues and pull requests. For questions
about the template or Axeptio, see the [Axeptio documentation](https://www.axept.io/)
or contact [support@axeptio.eu](mailto:support@axeptio.eu).
