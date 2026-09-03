#!/usr/bin/env node
//
// Fails when a commit typed `feat` or `fix` changed nothing a GTM user installs.
//
// Why this exists: release-please decides the release from the commit TYPE, and
// scripts/update-metadata-version.mjs turns the resulting changelog section into
// the gallery changeNotes. So a `feat`/`fix` commit is a promise to publish a
// line to every GTM user browsing the Community Template Gallery.
//
// That promise has been broken twice. v2.1.6 shipped "**ci:** stop the GTM sync
// republishing on every run" because the commit was typed `fix(ci)` — `fix` is a
// visible changelog section while `ci` is hidden, so the type decided the
// release and the scope was only what got displayed. update-metadata-version.mjs
// now filters internal SCOPES, which closed that one. v2.8.0 then shipped "read
// the deployed bundle through Playwright rather than the page" from a commit
// typed bare `fix:` with no scope at all — nothing downstream could catch it,
// and the line was removed from metadata.yaml by hand.
//
// Filtering cannot fix this. By the time the changelog exists the type is
// already what release-please parsed, and a bare `fix:` carries no signal to
// filter on. The check has to happen where the type is chosen: at the commit.
//
// The rule is deliberately about the ___TESTS___ block, not about file paths.
// The v2.8.0 commit touched template.tpl, so "feat/fix must touch template.tpl"
// would have passed it — both its hunks were inside ___TESTS___. Test scenarios
// live in template.tpl and do ship to the gallery, but changing one changes
// nothing a visitor experiences, so it is not a release.
//
// Paired with lib/template.mjs's parser rather than a line-offset guess: the
// diff is read as a set of changed line numbers and compared against the
// ___TESTS___ range in the version BEFORE the commit, because that is the file
// the hunk offsets refer to.

import { execFileSync } from 'node:child_process';

const RELEASE_TYPES = new Set(['feat', 'fix']);

// Anything here changes what a container runs or what the gallery serves.
// metadata.yaml is generated, but a hand edit to it is a gallery change.
const SHIPPED_PATHS = new Set(['template.tpl', 'metadata.yaml']);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

/** Conventional-commit type of a subject line, or null if it has none. */
export function commitType(subject) {
  const match = /^([a-z]+)(\([^)]*\))?!?:/.exec(subject);
  return match ? match[1] : null;
}

/**
 * Line numbers of `file` that a unified diff removes or replaces, taken from
 * the hunk headers' OLD side. New-file line numbers are useless here: they
 * index the post-commit file, whose ___TESTS___ marker may itself have moved.
 *
 * A pure addition (old count 0) is attributed to the line it lands after, which
 * is what "inside the tests block" means for an appended scenario.
 */
export function changedOldLines(diff) {
  const lines = new Set();

  for (const header of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+/gm)) {
    const start = Number(header[1]);
    const count = header[2] === undefined ? 1 : Number(header[2]);
    if (count === 0) {
      lines.add(start);
      continue;
    }
    for (let n = start; n < start + count; n += 1) lines.add(n);
  }

  return lines;
}

/** 1-based line of the `___TESTS___` marker, or null when the file has none. */
export function testsMarkerLine(source) {
  const lines = source.split('\n');
  const index = lines.findIndex((line) => line === '___TESTS___');
  return index === -1 ? null : index + 1;
}

/**
 * Does this commit change anything a GTM user installs?
 *
 * `read` is injected so the tests can drive this without a git repository.
 * It takes (revision, path) and returns the file's content at that revision,
 * or null when the path did not exist there.
 */
export function changesShippedBehaviour(commit, paths, read) {
  const shipped = paths.filter((path) => SHIPPED_PATHS.has(path));
  if (shipped.length === 0) return false;
  if (shipped.some((path) => path !== 'template.tpl')) return true;

  // template.tpl only. A new file is a release by construction; there is no
  // previous ___TESTS___ block to be inside of.
  const before = read(`${commit}^`, 'template.tpl');
  if (before === null) return true;

  const marker = testsMarkerLine(before);
  if (marker === null) return true;

  const diff = read(`diff:${commit}`, 'template.tpl');
  const changed = changedOldLines(diff);
  if (changed.size === 0) return true;

  // ___NOTES___ sits after ___TESTS___ and is not shipped behaviour either, so
  // everything from the marker to end-of-file counts as non-shipping.
  return [...changed].some((line) => line < marker);
}

function readFromGit(revision, path) {
  if (revision.startsWith('diff:')) {
    return git('show', '--format=', '--unified=0', revision.slice(5), '--', path);
  }
  try {
    return git('show', `${revision}:${path}`);
  } catch {
    return null;
  }
}

function main() {
  const range = process.argv[2];

  if (!range) {
    console.error('usage: node scripts/check-release-typing.mjs <base>..<head>');
    process.exit(2);
  }

  const commits = git('rev-list', '--no-merges', '--reverse', range)
    .split('\n')
    .filter(Boolean);

  if (commits.length === 0) {
    console.log(`No non-merge commits in ${range}.`);
    return;
  }

  const offenders = [];

  for (const commit of commits) {
    const subject = git('show', '--format=%s', '--no-patch', commit).trim();
    if (!RELEASE_TYPES.has(commitType(subject))) continue;

    const paths = git('show', '--format=', '--name-only', commit).split('\n').filter(Boolean);

    if (!changesShippedBehaviour(commit, paths, readFromGit)) {
      offenders.push({ commit, subject, paths });
    }
  }

  if (offenders.length > 0) {
    console.error('These commits are typed as a release but change nothing a GTM user installs:');
    console.error();
    for (const { commit, subject, paths } of offenders) {
      console.error(`  ${commit.slice(0, 9)} ${subject}`);
      for (const path of paths) console.error(`            ${path}`);
    }
    console.error();
    console.error('`feat` and `fix` cut a release, and its changelog section becomes the');
    console.error('template\'s public changeNotes in the GTM Community Template Gallery.');
    console.error('A change confined to tests, CI or tooling ships a line describing our');
    console.error('internals to every GTM user who installed the tag.');
    console.error();
    console.error('Retype them, then force-push:');
    console.error('  test:  a ___TESTS___ scenario, e2e/, test/ or lib/');
    console.error('  ci:    .github/workflows/');
    console.error('  chore: scripts/ and other tooling');
    console.error('  docs:  README, docs/');
    console.error();
    console.error('If the commit really does change shipped behaviour, it has to touch');
    console.error('template.tpl outside ___TESTS___ (or metadata.yaml) for that to be true.');
    process.exit(1);
  }

  console.log(`${commits.length} commit(s) checked; every feat/fix changes shipped behaviour.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
