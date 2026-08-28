#!/usr/bin/env node
// Prepends a new entry to the `versions:` list in metadata.yaml so the GTM
// Community Template Gallery version history stays in sync with releases.
// The gallery requires reverse chronological order (most recent version
// first), so new entries go directly under the `versions:` key.
//
// Invoked by .github/workflows/release.yml after a release is published.
// Inputs (environment):
//   RELEASE_TAG  e.g. "v1.2.0"  (the git tag release-please just created)
//   RELEASE_SHA  the commit SHA the release points at
//
// changeNotes are derived from the matching section of CHANGELOG.md. The script
// uses only Node built-ins (no dependencies) and edits the file textually so the
// existing license header and entries are preserved exactly.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const METADATA_PATH = 'metadata.yaml';
const CHANGELOG_PATH = 'CHANGELOG.md';

// --- What reaches the gallery ----------------------------------------------
//
// changeNotes are what a GTM user reads under "What's new" on the public
// listing, and that is a different audience from CHANGELOG.md: "expand the
// README", "harden the sync workflow" or "rename an internal helper" tells them
// nothing about the tag they are installing. CHANGELOG.md still records
// everything — only the gallery view is filtered, by three rules:
//
//   1. Section (GALLERY_SECTIONS) — an allowlist of changelog headings, so a
//      section added to release-please-config.json later stays off the public
//      listing until someone decides it belongs there.
//   2. Scope (INTERNAL_SCOPES) — the section is not enough on its own: a
//      `fix(ci)` commit lands under "Bug Fixes", which is how v2.1.6 published
//      "**ci:** stop the GTM sync republishing on every run" to the gallery.
//   3. Merge commits — PRs land as merge commits and this repository writes the
//      PR title into the merge body, so release-please credits the merge with a
//      line that restates the branch commits in vaguer words (v2.2.0 listed
//      both). Dropping the merge keeps the commits that did the work.
//
// What survives is then rendered for plain text, because the gallery renders no
// markdown: `**template:**` would reach the reader with its asterisks showing.
// `template` is also the scope of nearly every published line, so it
// distinguishes nothing and is dropped outright; any other scope is kept as a
// plain `scope: subject` prefix.

// Section names must match the `section` values in release-please-config.json,
// plus release-please's built-in breaking-changes heading.
const GALLERY_SECTIONS = new Set([
  '⚠ BREAKING CHANGES',
  'Features',
  'Bug Fixes',
  'Performance Improvements',
  'Reverts',
]);

// Commit scopes whose work never changes the tag a GTM user installs.
const INTERNAL_SCOPES = new Set(['ci', 'build', 'chore', 'docs', 'test']);

// The scope carried by nearly every gallery-worthy commit — implied, so unprinted.
const IMPLIED_SCOPE = 'template';

// `* **scope:** subject` / `- subject`; the scope is optional.
const BULLET = /^[*-]\s+(?:\*\*([^*:]+):\*\*\s*)?(.*)$/;
// Trailing "([abc1234](url))" commit reference, capturing the abbreviated sha.
const COMMIT_REF = /\s*\(\[([^\]]+)\]\([^)]+\)\)\s*$/;

// --- Build the changeNotes text from the changelog -------------------------

/**
 * Body (everything up to the next "## " heading) of the most recent version
 * section in `changelogText`, or null when there is no version section.
 */
function latestSection(changelogText) {
  if (!changelogText) return null;
  // First "## ..." heading marks the latest release section.
  const start = changelogText.indexOf('\n## ');
  const headingStart = changelogText.startsWith('## ') ? 0 : start;
  if (headingStart === -1) return null;

  const afterHeading = changelogText.indexOf('\n', headingStart + 1);
  if (afterHeading === -1) return null;
  const nextHeading = changelogText.indexOf('\n## ', afterHeading);
  return changelogText
    .slice(afterHeading + 1, nextHeading === -1 ? undefined : nextHeading)
    .trim();
}

/**
 * Condenses the most recent CHANGELOG.md section into the plain-text lines that
 * go in the gallery changeNotes field. See "What reaches the gallery" above.
 *
 * Pure: `changelogText` is the file's content and `isMergeCommit(sha) =>
 * boolean` is injected, so the filtering is testable without a git checkout.
 * Falls back to `Release <tag>` when nothing survives — or to a bare `Release`
 * when no tag was passed, since "Release undefined" would ship to the gallery.
 */
export function buildChangeNotes(changelogText, { tag, isMergeCommit = () => false } = {}) {
  const fallback = tag ? `Release ${tag}` : 'Release';
  const body = latestSection(changelogText);
  if (body === null) return fallback;

  // Walk the section headings so each bullet can be judged by the section it
  // sits under, keeping only the gallery-worthy ones.
  const lines = [];
  let section = null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^#{3,}\s+(.*)$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const bullet = line.match(BULLET);
    if (!bullet) continue;
    // A bullet before the first heading has no section to judge it by. Keep it:
    // dropping a real release note is worse than letting one stray line through.
    if (section !== null && !GALLERY_SECTIONS.has(section)) continue;

    const scope = bullet[1]?.trim().toLowerCase() ?? null;
    if (scope !== null && INTERNAL_SCOPES.has(scope)) continue;

    let subject = bullet[2].trim();
    // A bullet with no trailing commit reference — release-please writes the
    // BREAKING CHANGES entries that way — cannot be merge-checked, so it stays.
    const ref = subject.match(COMMIT_REF);
    if (ref && isMergeCommit(ref[1])) continue;

    subject = subject
      .replace(COMMIT_REF, '')
      // flatten any remaining inline "[text](url)" to just "text" — release-please
      // auto-links things like @master in a subject, and the raw markdown is noise
      // in the gallery, which renders these notes as plain text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // same for inline **bold**: the gallery would print the asterisks
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .trim();
    if (!subject) continue;

    lines.push(scope && scope !== IMPLIED_SCOPE ? `- ${scope}: ${subject}` : `- ${subject}`);
  }

  // A breaking change is listed twice by release-please (once under BREAKING
  // CHANGES, once under its own type), and a subject can repeat when the same
  // fix reached the branch by more than one route. Keep the first occurrence.
  const deduped = [...new Set(lines)];

  if (deduped.length === 0) return fallback;
  return deduped.join('\n');
}

// --- CLI --------------------------------------------------------------------

/**
 * `isMergeCommit` backed by the checkout: `git rev-list --parents -n 1 <sha>`
 * prints the commit followed by its parents, so three or more fields means a
 * merge. If git cannot answer (shallow clone, missing object, no git at all)
 * the line is kept — publishing one duplicate beats dropping a real release
 * note. Only this filter is lost: the section and scope filters are pure and
 * keep working. The failure is reported once, as a `::warning::` annotation so
 * it is visible on the release run and not just buried in the step log, and the
 * degradation is then sticky for the rest of the run: git is not going to
 * start working mid-release, and one warning is the useful number.
 */
function gitIsMergeCommit() {
  let degraded = false;
  return (sha) => {
    if (degraded) return false;
    try {
      const out = execFileSync('git', ['rev-list', '--parents', '-n', '1', sha], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out.trim().split(/\s+/).length >= 3;
    } catch (error) {
      degraded = true;
      console.error(
        `::warning::Could not ask git about ${sha} (${error.message}); ` +
          'merge commits can no longer be filtered, every other filter still applies.',
      );
      return false;
    }
  };
}

function main() {
  const tag = process.env.RELEASE_TAG?.trim();
  const sha = process.env.RELEASE_SHA?.trim();

  if (!tag || !sha) {
    console.error('RELEASE_TAG and RELEASE_SHA must both be set.');
    process.exit(1);
  }

  let metadata = readFileSync(METADATA_PATH, 'utf8');

  if (metadata.includes(sha)) {
    console.log(`metadata.yaml already contains ${sha}; nothing to do.`);
    process.exit(0);
  }

  // Normalize before matching so a file ending exactly at `versions:` (no
  // trailing newline) still matches and gets its entry inserted below the key.
  if (!metadata.endsWith('\n')) metadata += '\n';

  // The gallery indexes the published version off the `# Latest version`
  // comment immediately above the top entry. Strip it (and the `# Older
  // versions` marker above the entry it demotes) so we can re-add both in the
  // right place below — otherwise the marker silently stays on the old entry
  // and the gallery keeps indexing a stale version.
  metadata = metadata
    .replace(/^[ \t]*# Latest version\r?\n/m, '')
    .replace(/^[ \t]*# Older versions\r?\n/m, '');

  const versionsKey = metadata.match(/^versions:[ \t]*\r?\n/m);
  if (!versionsKey) {
    console.error('Could not find a `versions:` key in metadata.yaml.');
    process.exit(1);
  }

  let changelog = '';
  try {
    changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  } catch {
    changelog = '';
  }

  const changeNotes = buildChangeNotes(changelog, { tag, isMergeCommit: gitIsMergeCommit() });

  // Render changeNotes as a YAML literal block scalar so multi-line release notes
  // stay valid. Entry items use 2-space indent (matching existing entries);
  // changeNotes content is indented a further 6 spaces.
  const notesBlock = changeNotes
    .split('\n')
    .map((l) => `      ${l}`)
    .join('\n');

  const entry = `  # Latest version\n  - sha: ${sha}\n    changeNotes: |-\n${notesBlock}\n  # Older versions\n`;

  // Insert directly under `versions:` so the newest release is listed first.
  const insertAt = versionsKey.index + versionsKey[0].length;
  writeFileSync(METADATA_PATH, metadata.slice(0, insertAt) + entry + metadata.slice(insertAt), 'utf8');
  console.log(`Prepended ${tag} (${sha}) to ${METADATA_PATH}.`);
}

// `import.meta.main` is not available on Node 20, so compare paths instead.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
