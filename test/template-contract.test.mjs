// Runs scripts/validate-template.mjs against the real template.tpl, and proves
// each of its checks actually fires.
//
// A validator that only ever runs against a passing input is indistinguishable
// from one that returns [] unconditionally, so every check gets a mutated copy of
// template.tpl that should trip it. The mutations are applied to a throwaway file
// in a temp dir — template.tpl itself is never written to.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTemplate } from '../scripts/validate-template.mjs';

const TPL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'template.tpl');
const source = readFileSync(TPL_PATH, 'utf8');

// Apply `mutate` to the template source, validate the result, and hand back the
// violations. Each case gets its own temp dir so failures leave no shared state.
function violationsAfter(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-contract-'));
  const path = join(dir, 'template.tpl');
  try {
    const mutated = mutate(source);
    assert.notEqual(mutated, source, 'mutation did not change the template — the anchor text moved');
    writeFileSync(path, mutated);
    return validateTemplate(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const replaceOnce = (needle, replacement) => (src) => {
  const index = src.indexOf(needle);
  assert.notEqual(index, -1, `anchor not found in template.tpl: ${needle}`);
  return src.slice(0, index) + replacement + src.slice(index + needle.length);
};

const matching = (violations, re) => violations.filter((v) => re.test(v));

test('template.tpl passes every contract check', () => {
  assert.deepEqual(validateTemplate(TPL_PATH), []);
});

test('catches a consent type that access_consent cannot write', () => {
  // All seven Google consent types are granted now, so the negative case is a
  // container-defined custom consent type - which is exactly what an unfiltered
  // cookie key could turn out to be.
  const violations = violationsAfter(
    replaceOnce(
      "const allowedConsentTypes = ['ad_storage'",
      "const allowedConsentTypes = ['my_custom_consent', 'ad_storage'",
    ),
  );
  assert.equal(matching(violations, /my_custom_consent.*access_consent/).length, 1, violations.join('\n'));
});

test('catches a renamed template parameter', () => {
  const violations = violationsAfter(replaceOnce('"name": "cookiesDomain"', '"name": "cookiesDomainRenamed"'));
  // Both directions of the check should speak up: the read that now resolves to
  // undefined, and the parameter nothing reads.
  assert.equal(matching(violations, /data\.cookiesDomain is read/).length, 1, violations.join('\n'));
  assert.equal(matching(violations, /"cookiesDomainRenamed".*never reads/).length, 1, violations.join('\n'));
});

test('catches a URL outside the inject_script permission', () => {
  const violations = violationsAfter(
    replaceOnce("'https://static.axept.io/tcf/sdk.js'", "'https://cdn.example.com/tcf/sdk.js'"),
  );
  assert.equal(matching(violations, /cdn\.example\.com.*inject_script/).length, 1, violations.join('\n'));
});

test('catches an undocumented sandboxed API', () => {
  const violations = violationsAfter(
    replaceOnce("const makeNumber = require('makeNumber');", "const makeNumber = require('makeNumbre');"),
  );
  assert.equal(matching(violations, /makeNumbre.*not a documented/).length, 1, violations.join('\n'));
});

test('catches an API whose permission is not declared, and an unused permission', () => {
  // Misspell the permission's publicId rather than deleting the entry, so the JSON
  // stays valid and the two directions of the check are isolated: getCookieValues
  // now has no get_cookies grant, and the misspelled entry is granted to nobody.
  const violations = violationsAfter(replaceOnce('"publicId": "get_cookies"', '"publicId": "get_cookies_typo"'));
  assert.equal(
    matching(violations, /require\('getCookieValues'\) needs the "get_cookies" permission/).length,
    1,
    violations.join('\n'),
  );
  assert.equal(
    matching(violations, /declares "get_cookies_typo" but no required API needs it/).length,
    1,
    violations.join('\n'),
  );
});

test('catches a literal character that GTM would escape', () => {
  // Regression guard for the always-republish failure. GTM re-serialises the JSON
  // blocks and escapes ' = & < >, so a hand-typed apostrophe makes the stored
  // template permanently unequal to this file. Verified against the live API:
  // canonical file round-trips byte-for-byte, one literal apostrophe comes back
  // five bytes longer — which would make the CI sync publish on every single run.
  const violations = violationsAfter(replaceOnce('visitor\\u0027s country', "visitor's country"));
  assert.equal(
    matching(violations, /___TEMPLATE_PARAMETERS___ contains 1 literal .* GTM stores it as/).length,
    1,
    violations.join('\n'),
  );
});

test('catches malformed JSON in a structured block', () => {
  const violations = violationsAfter(replaceOnce('"publicId": "logging"', '"publicId" "logging"'));
  assert.equal(matching(violations, /___WEB_PERMISSIONS___ is not valid JSON/).length, 1, violations.join('\n'));
});

test('catches a hex literal in the sandboxed JS', () => {
  // Node's vm accepts 0xA0; GTM's parser does not, and only the non-gating compile
  // check would notice (PR #104). A hex literal inside a comment must NOT trip it.
  const violations = violationsAfter(replaceOnce('code === 160', 'code === 0xA0'));
  assert.equal(matching(violations, /hex literal 0xA0/).length, 1, violations.join('\n'));
  const commentOnly = violationsAfter(replaceOnce('code === 160', 'code === 160 /* was 0xA0 */'));
  assert.equal(matching(commentOnly, /hex literal/).length, 0, commentOnly.join('\n'));
  // A URL string on the same line must not swallow the literal as a "comment".
  const afterUrl = violationsAfter(replaceOnce('code === 160', "'https://h.example' === 0xA0 || code === 160"));
  assert.equal(matching(afterUrl, /hex literal 0xA0/).length, 1, afterUrl.join('\n'));
});
