# How to Contribute

We'd love to accept your patches and contributions to this project. There are
just a few small guidelines you need to follow.

## Contributions and licensing

From version `1.0.0`, this template is distributed under Axeptio's licensing
terms (see [LICENSE](./LICENSE)); earlier versions remain under the Apache
License 2.0. By submitting a contribution you agree that it is provided under,
and may be redistributed as part of this project under, those Axeptio licensing
terms.

## Code reviews

All submissions, including submissions by project members, require review. We
use GitHub pull requests for this purpose. Consult
[GitHub Help](https://help.github.com/articles/about-pull-requests/) for more
information on using pull requests.

## Commit & pull request conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
to drive automated [Semantic Versioning](https://semver.org/) and changelog
generation via [release-please](https://github.com/googleapis/release-please).

A commit / PR title must follow:

```
<type>(<optional scope>): <description>
```

**Allowed types**

| Type       | Effect on version | Use for                                    |
| ---------- | ----------------- | ------------------------------------------ |
| `feat`     | minor bump        | a new feature                              |
| `fix`      | patch bump        | a bug fix                                  |
| `docs`     | none              | documentation only                         |
| `refactor` | none              | code change that isn't a fix or feature    |
| `perf`     | none              | performance improvement                    |
| `test`     | none              | tests                                      |
| `ci`       | none              | CI / GitHub Actions changes                |
| `build`    | none              | build system or dependencies               |
| `chore`    | none              | maintenance / tooling                      |
| `revert`   | none              | reverting a previous commit                |

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

- A CI check (`Commitlint`) enforces the format on every commit in a pull
  request.
- Releases, `CHANGELOG.md`, git tags and GitHub Releases are **all generated
  automatically** by release-please. Do not edit versions or the changelog by
  hand. See [docs/release-automation.md](./docs/release-automation.md).
- The `versions:` history in `metadata.yaml` is what the GTM Community Template
  Gallery publishes. It is currently maintained by hand — add an entry only when
  `template.tpl` actually changes.

## Community Guidelines

Please be respectful and constructive in issues and pull requests. For questions
about the template or Axeptio, see the [Axeptio documentation](https://www.axept.io/)
or contact [support@axeptio.eu](mailto:support@axeptio.eu).
