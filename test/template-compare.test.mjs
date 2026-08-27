// Guards compareTemplates, the decision the CI sync makes on every run.
//
// This test exists because the previous attempt at this problem shipped without one.
// The comparison was verified by hand against the live API, that verification read
// the file with the BOM stripped while the script sent it with the BOM intact, and
// the result was that every CI run republished the container for five days.
//
// So the cases below are the two failure modes that actually happened, plus proof
// that a genuine edit is still detected — because a comparison that returns "equal"
// unconditionally would also make these first cases pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compareTemplates, stripBom } from '../lib/template.mjs';

const TPL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'template.tpl');
const withBom = readFileSync(TPL_PATH, 'utf8');
const noBom = stripBom(withBom);

test('template.tpl really does carry a BOM', () => {
  // If this ever stops being true the BOM cases below stop testing anything, so
  // assert the premise rather than letting them quietly become tautologies.
  assert.equal(withBom.charCodeAt(0), 0xfeff);
  assert.notEqual(noBom.charCodeAt(0), 0xfeff);
});

test('a BOM-only difference is not a change', () => {
  // The actual bug: the script sent the BOM, GTM stored it without, and one
  // invisible character made every run publish a new container version.
  const result = compareTemplates(withBom, noBom);
  assert.ok(result.equal, `expected equal, got: ${result.differences.join('; ')}`);
});

test('GTM-style escaping in a JSON block is not a change', () => {
  // GTM re-serialises the JSON blocks, escaping ' = & < > as \uXXXX. The file is kept
  // canonical by check 2 of validate-template.mjs, but the sync must not depend on
  // that: one hand-edit would otherwise mean republishing forever.
  const stored = noBom.replace('\\u0027s country', "'s country");
  assert.notEqual(stored, noBom, 'fixture did not change anything — the anchor moved');

  const result = compareTemplates(noBom, stored);
  assert.ok(result.equal, `expected equal, got: ${result.differences.join('; ')}`);
});

test('reordered keys in a JSON block are not a change', () => {
  // Key order carries no meaning in JSON and GTM need not preserve it.
  const reordered = noBom.replace('"type": "TAG",\n  "id": "cvt_5TPRD",', '"id": "cvt_5TPRD",\n  "type": "TAG",');
  assert.notEqual(reordered, noBom, 'fixture did not change anything — the anchor moved');

  const result = compareTemplates(noBom, reordered);
  assert.ok(result.equal, `expected equal, got: ${result.differences.join('; ')}`);
});

test('a real edit to the sandboxed JS is a change, and is named', () => {
  const edited = noBom.replace("const logToConsole = require('logToConsole');",
    "const logToConsole = require('logToConsole'); // edited");
  assert.notEqual(edited, noBom, 'fixture did not change anything — the anchor moved');

  const result = compareTemplates(noBom, edited);
  assert.equal(result.equal, false);
  assert.match(result.differences.join('; '), /___SANDBOXED_JS_FOR_WEB_TEMPLATE___/);
});

test('a real edit inside a JSON block is a change, and is named', () => {
  const edited = noBom.replace('"displayName": "Axeptio CMP"', '"displayName": "Axeptio CMP 2"');
  assert.notEqual(edited, noBom, 'fixture did not change anything — the anchor moved');

  const result = compareTemplates(noBom, edited);
  assert.equal(result.equal, false);
  assert.match(result.differences.join('; '), /___INFO___/);
});

test('a missing templateData is reported, not treated as equal', () => {
  // findTemplate reads the LIST endpoint, which is not contractually obliged to
  // include templateData. Undefined must never look like "no change".
  for (const absent of [undefined, null, '']) {
    const result = compareTemplates(noBom, absent);
    assert.equal(result.equal, false, `expected a difference for ${JSON.stringify(absent)}`);
    assert.ok(result.differences.length > 0);
  }
});
