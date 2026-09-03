import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commitType,
  changedOldLines,
  testsMarkerLine,
  changesShippedBehaviour,
} from '../scripts/check-release-typing.mjs';

test('commitType reads the type off a conventional subject', () => {
  assert.equal(commitType('fix: read the deployed bundle through Playwright'), 'fix');
  assert.equal(commitType('feat(template): resolve flow through geolocation'), 'feat');
  assert.equal(commitType('feat!: drop the legacy field'), 'feat');
  assert.equal(commitType('fix(ci)!: repoint the workflow'), 'fix');
  assert.equal(commitType('chore(metadata): sync version history'), 'chore');
});

test('commitType returns null when there is no conventional prefix', () => {
  assert.equal(commitType('Merge pull request #126 from axeptio/develop'), null);
  assert.equal(commitType('Publish new version fcf254c'), null);
  assert.equal(commitType('FIX: shouting is not a type'), null);
});

test('changedOldLines expands hunk ranges from the old side', () => {
  assert.deepEqual([...changedOldLines('@@ -10,3 +10,3 @@ scenarios:')], [10, 11, 12]);
  assert.deepEqual([...changedOldLines('@@ -7 +7 @@')], [7]);
});

test('changedOldLines attributes a pure addition to the line it lands after', () => {
  // Old count 0 means nothing was removed. Without this the appended scenario
  // would contribute no lines at all and the commit would read as shipping.
  assert.deepEqual([...changedOldLines('@@ -2650,0 +2651,8 @@')], [2650]);
});

test('changedOldLines collects every hunk', () => {
  const diff = ['@@ -2651,7 +2651,7 @@ scenarios:', '@@ -3237,2 +3237,2 @@ scenarios:'].join('\n');
  const lines = changedOldLines(diff);
  assert.ok(lines.has(2651) && lines.has(2657));
  assert.ok(lines.has(3237) && lines.has(3238));
  assert.equal(lines.size, 9);
});

test('testsMarkerLine only matches the marker on a line of its own', () => {
  assert.equal(testsMarkerLine('___INFO___\n\n{}\n\n___TESTS___\n\nscenarios: []'), 5);
  assert.equal(testsMarkerLine('// see ___TESTS___ for coverage\nconst a = 1;'), null);
  assert.equal(testsMarkerLine('___INFO___\n\n{}\n'), null);
});

const reader = ({ before = 'x', diff = '' }) => (revision, path) => {
  assert.equal(path, 'template.tpl');
  return revision.startsWith('diff:') ? diff : before;
};

test('a commit touching nothing shipped is not a release', () => {
  const paths = ['e2e/live-container.spec.mjs', '.github/workflows/test.yml'];
  assert.equal(changesShippedBehaviour('abc', paths, reader({})), false);
});

test('a hand edit to metadata.yaml is a release', () => {
  assert.equal(changesShippedBehaviour('abc', ['metadata.yaml'], reader({})), true);
});

test('a template.tpl change confined to ___TESTS___ is not a release', () => {
  // The v2.8.0 leak: subject typed `fix:`, both hunks inside the tests block.
  const before = `${'line\n'.repeat(2462)}___TESTS___\n${'line\n'.repeat(2000)}`;
  const diff = ['@@ -2651,7 +2651,7 @@ scenarios:', '@@ -3237,2 +3237,2 @@ scenarios:'].join('\n');

  assert.equal(testsMarkerLine(before), 2463);
  assert.equal(
    changesShippedBehaviour('abc', ['e2e/live.spec.mjs', 'template.tpl'], reader({ before, diff })),
    false,
  );
});

test('a template.tpl change outside ___TESTS___ is a release', () => {
  const before = `${'line\n'.repeat(2462)}___TESTS___\n${'line\n'.repeat(2000)}`;
  const diff = '@@ -1200,4 +1200,6 @@ const consent = ';

  assert.equal(changesShippedBehaviour('abc', ['template.tpl'], reader({ before, diff })), true);
});

test('one hunk outside ___TESTS___ is enough, even alongside test edits', () => {
  const before = `${'line\n'.repeat(2462)}___TESTS___\n${'line\n'.repeat(2000)}`;
  const diff = ['@@ -900,2 +900,2 @@', '@@ -2651,7 +2651,7 @@ scenarios:'].join('\n');

  assert.equal(changesShippedBehaviour('abc', ['template.tpl'], reader({ before, diff })), true);
});

test('a template.tpl that did not exist before the commit is a release', () => {
  const read = (revision) => (revision.startsWith('diff:') ? '' : null);
  assert.equal(changesShippedBehaviour('abc', ['template.tpl'], read), true);
});

test('a template.tpl with no ___TESTS___ block is a release', () => {
  const before = '___INFO___\n\n{}\n';
  const diff = '@@ -1,2 +1,3 @@';
  assert.equal(changesShippedBehaviour('abc', ['template.tpl'], reader({ before, diff })), true);
});

test('an empty diff on template.tpl is treated as a release rather than waved through', () => {
  // Mode-only or rename-only changes produce no hunks. Failing open here would
  // let a crafted commit past the check; failing closed only costs a retype.
  const before = `${'line\n'.repeat(2462)}___TESTS___\n`;
  assert.equal(changesShippedBehaviour('abc', ['template.tpl'], reader({ before })), true);
});
