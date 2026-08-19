// Headless runner for the GTM custom-template tests embedded in template.tpl.
//
// GTM stores template unit tests as YAML scenarios in the ___TESTS___ section and
// only runs them inside the GTM UI "Tests" tab — Google ships no CLI runner. This
// file registers one Node test per scenario and executes it against the Test API
// in lib/gtm-test-api.mjs, which runs the REAL sandboxed source extracted from
// template.tpl (never a copy). The scenarios are the single source of truth: they
// run unchanged here and in the GTM UI.
//
// Ported from axeptio/axeptio-sgtm-public-template; the shimmed APIs differ because
// this is a WEB template (injectScript, consent state, window access) rather than a
// server-side one (HTTP request/response).

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { loadTemplate } from '../lib/template.mjs';
import { buildTestApi } from '../lib/gtm-test-api.mjs';

const TPL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'template.tpl');

const { sandboxSource, tests: parsedTests } = loadTemplate(TPL_PATH);
const scenarios = parsedTests.scenarios || [];
const sharedSetup = parsedTests.setup || '';

// --- Register one Node test per scenario. -------------------------------------
if (scenarios.length === 0) {
  test('template.tpl has at least one ___TESTS___ scenario', () => {
    throw new Error('No scenarios found in template.tpl ___TESTS___');
  });
}

// --- Guard: GTM test-name legality. -------------------------------------------
// GTM's Custom Template editor validates each ___TESTS___ scenario name and
// rejects punctuation (e.g. "."), which silently blocks saving template.tpl in
// the GTM UI. Catch it here in CI instead. Allowlist known-safe characters
// rather than blocklisting, since GTM's full rejected set is undocumented.
const GTM_SAFE_NAME = /^[A-Za-z0-9 _-]+$/;

test('all scenario names are GTM-legal', () => {
  // Self-check: the guard must actually reject the characters we care about.
  for (const bad of ['has.dot', 'a/b', 'a,b', 'a(b)']) {
    if (GTM_SAFE_NAME.test(bad)) throw new Error(`guard is too permissive: accepted "${bad}"`);
  }
  // A scenario with no name at all must fail here rather than slip through:
  // RegExp.test() stringifies its argument, so an undefined name is tested as the
  // literal "undefined" and passes the allowlist, registering a Node test called
  // "undefined" that looks legitimate in the output.
  const nameless = scenarios.filter((s) => typeof s.name !== 'string' || s.name.trim() === '');
  if (nameless.length > 0) {
    throw new Error(`${nameless.length} scenario(s) have a missing or empty name`);
  }

  const illegal = scenarios.map((s) => s.name).filter((name) => !GTM_SAFE_NAME.test(name));
  if (illegal.length > 0) {
    throw new Error(
      'These test names contain characters GTM rejects (use letters, numbers, ' +
      `spaces, hyphens, underscores only):\n  ${illegal.join('\n  ')}`,
    );
  }
});

for (const scenario of scenarios) {
  test(scenario.name, () => {
    const { api } = buildTestApi(sandboxSource);
    const context = vm.createContext(api);
    vm.runInContext(`${sharedSetup}\n${scenario.code}`, context, { timeout: 3000 });
  });
}
