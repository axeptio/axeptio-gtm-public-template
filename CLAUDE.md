# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Architecture Overview

This repo is **not an application** — it is the public source for the Axeptio CMP tag in the
[GTM Community Template Gallery](https://tagmanager.google.com/gallery). Two files are the product:

- **`template.tpl`** — the GTM custom template: `___INFO___`, `___TEMPLATE_PARAMETERS___`,
  `___SANDBOXED_JS___`, `___WEB_PERMISSIONS___` and `___TESTS___` blocks in Google's own format.
  Its `___TERMS_OF_SERVICE___` header is Google's mandatory gallery boilerplate — **never edit it**.
- **`metadata.yaml`** — the gallery's published version history (`versions:`, one commit SHA +
  `changeNotes` per version, newest first). This is what the gallery actually serves.

Everything else is licensing (`LICENSE`, `CONTRIBUTING.md`), release automation
(`.github/workflows/`, `scripts/`, `release-please-config.json`) or agent tooling (`.beads/`).

## Build & Test

There is **no build, no compile, and no test runner** — nothing to install. Validation is by
inspection plus these checks:

```bash
python3 -c "import yaml; yaml.safe_load(open('metadata.yaml'))"   # metadata.yaml still parses
python3 -c "import json; json.load(open('release-please-config.json'))"
node --check scripts/update-metadata-version.mjs
```

To exercise the template itself, import `template.tpl` into a GTM container and use the
**Tests** tab (the `___TESTS___` block).

## Conventions & Patterns

- **Conventional Commits are mandatory.** PRs are squash-merged, so the **PR title** becomes the
  commit on `master` and is what release-please parses. CI (`Lint commits`) enforces both the PR
  title and every commit. Types/scopes live in `commitlint.config.mjs`.
- **Single branch: `master`.** It is both the default and the release branch. No `develop`.
- **Never hand-edit `VERSION`, `CHANGELOG.md`, `.release-please-manifest.json`, or the
  `versions:` list in `metadata.yaml`** — all four are generated. See
  [docs/release-automation.md](docs/release-automation.md).
- **Licensing:** from `1.0.0` the template ships under Axeptio's licensing terms; earlier
  published versions stay under Apache 2.0 (that grant is irreversible). Don't reintroduce
  Apache headers.
- `gh` is the canonical interface for GitHub work.
