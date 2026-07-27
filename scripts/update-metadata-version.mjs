#!/usr/bin/env node
// Prepends a new entry to the `versions:` list in metadata.yaml so the GTM
// Community Template Gallery version history stays in sync with releases.
// The gallery requires reverse chronological order (most recent version
// first), so new entries go directly under the `versions:` key.
//
// Invoked by .github/workflows/release-please.yml after a release is published.
// Inputs (environment):
//   RELEASE_TAG  e.g. "v1.2.0"  (the git tag release-please just created)
//   RELEASE_SHA  the commit SHA the release points at
//
// changeNotes are derived from the matching section of CHANGELOG.md. The script
// uses only Node built-ins (no dependencies) and edits the file textually so the
// existing license header and entries are preserved exactly.

import { readFileSync, writeFileSync } from 'node:fs';

const METADATA_PATH = 'metadata.yaml';
const CHANGELOG_PATH = 'CHANGELOG.md';

const tag = process.env.RELEASE_TAG?.trim();
const sha = process.env.RELEASE_SHA?.trim();

if (!tag || !sha) {
  console.error('RELEASE_TAG and RELEASE_SHA must both be set.');
  process.exit(1);
}

// --- Build the changeNotes text from the changelog -------------------------

/**
 * Extracts the body (everything up to the next "## " heading) of the most
 * recent version section in CHANGELOG.md, then condenses it into a few
 * human-readable lines for the GTM changeNotes field.
 */
function buildChangeNotes() {
  let changelog = '';
  try {
    changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  } catch {
    return `Release ${tag}`;
  }

  // First "## ..." heading marks the latest release section.
  const start = changelog.indexOf('\n## ');
  const headingStart = changelog.startsWith('## ') ? 0 : start;
  if (headingStart === -1) return `Release ${tag}`;

  const afterHeading = changelog.indexOf('\n', headingStart + 1);
  const nextHeading = changelog.indexOf('\n## ', afterHeading);
  const body = changelog
    .slice(afterHeading + 1, nextHeading === -1 ? undefined : nextHeading)
    .trim();

  // Keep changelog bullet lines (features / fixes); drop section sub-headings
  // and links. Strip markdown commit links to keep notes readable.
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('* ') || l.startsWith('- '))
    .map((l) => l.replace(/^[*-]\s+/, '- '))
    // remove trailing "([abc1234](url))" commit references
    .map((l) => l.replace(/\s*\(\[[^\]]+\]\([^)]+\)\)\s*$/, ''))
    // flatten any remaining inline "[text](url)" to just "text" — release-please
    // auto-links things like @master in a subject, and the raw markdown is noise
    // in the gallery, which renders these notes as plain text
    .map((l) => l.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim());

  // A breaking change is listed twice by release-please (once under BREAKING
  // CHANGES, once under its own type), and a subject can repeat when the same
  // fix reached the branch by more than one route. Keep the first occurrence.
  const deduped = [...new Set(lines)];

  if (deduped.length === 0) return `Release ${tag}`;
  return deduped.join('\n');
}

// --- Prepend the new version entry to metadata.yaml ------------------------

let metadata = readFileSync(METADATA_PATH, 'utf8');

if (metadata.includes(sha)) {
  console.log(`metadata.yaml already contains ${sha}; nothing to do.`);
  process.exit(0);
}

// Normalize before matching so a file ending exactly at `versions:` (no
// trailing newline) still matches and gets its entry inserted below the key.
if (!metadata.endsWith('\n')) metadata += '\n';

const versionsKey = metadata.match(/^versions:[ \t]*\r?\n/m);
if (!versionsKey) {
  console.error('Could not find a `versions:` key in metadata.yaml.');
  process.exit(1);
}

const changeNotes = buildChangeNotes();

// Render changeNotes as a YAML literal block scalar so multi-line release notes
// stay valid. Entry items use 2-space indent (matching existing entries);
// changeNotes content is indented a further 6 spaces.
const notesBlock = changeNotes
  .split('\n')
  .map((l) => `      ${l}`)
  .join('\n');

const entry = `  - sha: ${sha}\n    changeNotes: |-\n${notesBlock}\n`;

// Insert directly under `versions:` so the newest release is listed first.
const insertAt = versionsKey.index + versionsKey[0].length;
writeFileSync(METADATA_PATH, metadata.slice(0, insertAt) + entry + metadata.slice(insertAt), 'utf8');
console.log(`Prepended ${tag} (${sha}) to ${METADATA_PATH}.`);
