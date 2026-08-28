// Proves the gallery filter in scripts/update-metadata-version.mjs, which turns
// the newest CHANGELOG.md section into the "What's new" text the GTM Community
// Template Gallery publishes.
//
// The published notes are only ever seen after a release, in a listing nobody on
// the team reads, so a regression here is silent: v2.1.6 shipped two `**ci:**`
// lines and v2.2.0 shipped a merge commit restating its own branch. Every filter
// gets a bullet that must not survive it, and the whole render is asserted line
// for line so a new leak fails the run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChangeNotes } from '../scripts/update-metadata-version.mjs';

const REPO = 'https://github.com/axeptio/axeptio-gtm-public-template';
// release-please's trailing commit reference, "([abc1234](url))".
const ref = (sha) => `([${sha}](${REPO}/commit/${sha}00000000000000000000000000000))`;

// One synthetic release section holding one bullet per filter, plus an older
// section that must not contribute (only the newest release is published).
const CHANGELOG = [
  '# Changelog',
  '',
  `## [2.5.0](${REPO}/compare/v2.4.0...v2.5.0) (2026-08-28)`,
  '',
  '',
  '### ⚠ BREAKING CHANGES',
  '',
  `* **template:** the Project ID field is now required ${ref('aaaaaaa')}`,
  '',
  '### Features',
  '',
  `* **template:** tick Consent Mode and open its group on new tags ${ref('bbbbbbb')}`,
  `* **template:** tick Consent Mode and open its group on new tags ${ref('ccccccc')}`,
  `* **sdk:** load the Publishers bundle for a Publishers project ${ref('ddddddd')}`,
  '',
  '### Bug Fixes',
  '',
  `* **ci:** stop the GTM sync republishing on every run ${ref('eeeeeee')}`,
  `* **template:** close the silent-failure paths found by the adversarial review ${ref('fffffff')}`,
  '',
  '### Documentation',
  '',
  `* expand the README and correct the gallery description ${ref('1111111')}`,
  '',
  `## [2.4.0](${REPO}/compare/v2.3.0...v2.4.0) (2026-08-27)`,
  '',
  '### Features',
  '',
  `* **template:** an older release nobody should see again ${ref('2222222')}`,
  '',
].join('\n');

// fffffff stands in for the merge commit release-please credits with the PR
// title (v2.2.0's "close the silent-failure paths ..." was PR #100's merge).
const MERGES = new Set(['fffffff']);
const isMergeCommit = (sha) => MERGES.has(sha);

const notes = buildChangeNotes(CHANGELOG, { tag: 'v2.5.0', isMergeCommit });
const lines = notes.split('\n');

test('publishes exactly the gallery-worthy bullets, in order', () => {
  assert.deepEqual(lines, [
    '- the Project ID field is now required',
    '- tick Consent Mode and open its group on new tags',
    '- sdk: load the Publishers bundle for a Publishers project',
  ]);
});

test('keeps a breaking change', () => {
  assert.ok(lines.includes('- the Project ID field is now required'), notes);
});

test('drops a ci-scoped bullet even though it sits under Bug Fixes', () => {
  assert.ok(!/republishing/.test(notes), notes);
});

test('drops the merge commit that restates the branch commits', () => {
  assert.ok(!/adversarial review/.test(notes), notes);
});

test('keeps a repeated subject once', () => {
  const repeats = lines.filter((l) => l === '- tick Consent Mode and open its group on new tags');
  assert.equal(repeats.length, 1, notes);
});

test('strips the implied template scope and its markdown', () => {
  assert.ok(!notes.includes('**'), notes);
  assert.ok(!notes.includes('template:'), notes);
});

test('keeps another scope as plain "scope: subject"', () => {
  assert.ok(lines.includes('- sdk: load the Publishers bundle for a Publishers project'), notes);
});

test('drops the Documentation section', () => {
  assert.ok(!/README/.test(notes), notes);
});

test('reads only the newest release section', () => {
  assert.ok(!/older release/.test(notes), notes);
});

test('strips inline links from a subject', () => {
  const changelog = [
    '## [3.0.0](compare) (2026-08-28)',
    '',
    '### Features',
    '',
    `* **template:** follow [the gallery contract](${REPO}/blob/master/metadata.yaml) ${ref('3333333')}`,
  ].join('\n');
  assert.equal(
    buildChangeNotes(changelog, { tag: 'v3.0.0' }),
    '- follow the gallery contract',
  );
});

test('strips inline bold from a subject', () => {
  const changelog = [
    '## [3.0.0](compare) (2026-08-28)',
    '',
    '### Features',
    '',
    `* **template:** make **X** required ${ref('5555555')}`,
  ].join('\n');
  assert.equal(buildChangeNotes(changelog, { tag: 'v3.0.0' }), '- make X required');
});

test('keeps an unscoped bullet', () => {
  const changelog = [
    '## [3.0.0](compare) (2026-08-28)',
    '',
    '### Features',
    '',
    `* add the region field ${ref('6666666')}`,
  ].join('\n');
  assert.equal(buildChangeNotes(changelog, { tag: 'v3.0.0' }), '- add the region field');
});

test('accepts the "-" bullet form', () => {
  const changelog = [
    '## [3.0.0](compare) (2026-08-28)',
    '',
    '### Features',
    '',
    `- **template:** add the region field ${ref('6666666')}`,
    '- rename the Project ID label',
  ].join('\n');
  assert.equal(
    buildChangeNotes(changelog, { tag: 'v3.0.0' }),
    '- add the region field\n- rename the Project ID label',
  );
});

test('falls back to a bare "Release" when no tag is passed', () => {
  assert.equal(buildChangeNotes('', {}), 'Release');
  assert.equal(buildChangeNotes(''), 'Release');
});

test('keeps every bullet when no isMergeCommit is injected', () => {
  const changelog = [
    '## [3.0.0](compare) (2026-08-28)',
    '',
    '### Bug Fixes',
    '',
    `* **template:** close the silent-failure paths found by the adversarial review ${ref('fffffff')}`,
  ].join('\n');
  assert.equal(
    buildChangeNotes(changelog, { tag: 'v3.0.0' }),
    '- close the silent-failure paths found by the adversarial review',
  );
});

test('falls back to "Release <tag>" when every bullet is filtered out', () => {
  const changelog = [
    '## [3.0.0](compare) (2026-08-28)',
    '',
    '### Documentation',
    '',
    `* expand the README ${ref('1111111')}`,
    '',
    '### Bug Fixes',
    '',
    `* **ci:** pin the runner image ${ref('4444444')}`,
  ].join('\n');
  assert.equal(buildChangeNotes(changelog, { tag: 'v3.0.0' }), 'Release v3.0.0');
});

test('falls back to "Release <tag>" when the changelog has no release section', () => {
  assert.equal(buildChangeNotes('', { tag: 'v3.0.0' }), 'Release v3.0.0');
  assert.equal(buildChangeNotes('# Changelog\n', { tag: 'v3.0.0' }), 'Release v3.0.0');
});
