// Behavioural checks the ___TESTS___ scenarios cannot express.
//
// GTM's Test API records *whether* an API was called and *with what*, never in
// what order. But this template has a load-bearing ordering: the SDK is a classic
// script, so it reads window.axeptioSettings as it boots, which only works because
// setInWindow runs before injectScript. Swapping those two lines leaves every
// scenario green and ships a tag whose settings are ignored.
//
// These tests use the runner-side callLog from lib/gtm-test-api.mjs rather than a
// custom assertion inside ___TESTS___: a scenario that used a non-GTM API would no
// longer run in the GTM UI, breaking the "same scenarios in both places" contract.
//
// The second group is a self-check on the Test API itself — a matcher that silently
// does nothing, or one that throws TypeError instead of asserting, would make every
// scenario using it meaningless.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTemplate } from '../lib/template.mjs';
import { buildTestApi } from '../lib/gtm-test-api.mjs';

const TPL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'template.tpl');
const { sandboxSource } = loadTemplate(TPL_PATH);

// Run the real sandboxed source and return the ordered list of API names called.
function callOrder(data) {
  const { api, callLog } = buildTestApi(sandboxSource);
  api.runCode(data);
  return callLog.map((entry) => entry.api);
}

const indexOf = (order, name) => order.indexOf(name);

test('settings are written to the window before the SDK is injected', () => {
  const order = callOrder({ id: '5f7dcb32ef1a4f2d3c8b4567', product: 'brands' });
  const setInWindow = indexOf(order, 'setInWindow');
  const injectScript = indexOf(order, 'injectScript');

  assert.notEqual(setInWindow, -1, `setInWindow was never called; order was ${order.join(' -> ')}`);
  assert.notEqual(injectScript, -1, `injectScript was never called; order was ${order.join(' -> ')}`);
  assert.ok(
    setInWindow < injectScript,
    'window.axeptioSettings must be set before the SDK script is injected — the SDK is a ' +
    `classic script and reads it as it boots. Order was: ${order.join(' -> ')}`,
  );
});

test('consent defaults are set before the SDK is injected', () => {
  // Consent Mode defaults must land before any Google tag — and before the CMP
  // itself — or the first hits go out under the wrong consent state.
  const order = callOrder({
    id: '5f7dcb32ef1a4f2d3c8b4567',
    product: 'brands',
    isComoEnabled: true,
    defaultSettings: [{ region: 'FR, DE', ad_storage: 'denied', analytics_storage: 'denied' }],
  });
  const setDefault = indexOf(order, 'setDefaultConsentState');
  const injectScript = indexOf(order, 'injectScript');

  assert.notEqual(setDefault, -1, `setDefaultConsentState was never called; order was ${order.join(' -> ')}`);
  assert.ok(
    setDefault < injectScript,
    `consent defaults must precede SDK injection. Order was: ${order.join(' -> ')}`,
  );
});

// --- Test API self-checks -----------------------------------------------------

test('an unimplemented matcher names itself instead of throwing TypeError', () => {
  const { api } = buildTestApi(sandboxSource);
  assert.throws(
    () => api.assertThat(1).isSomethingNobodyImplemented(),
    /not implemented by this runner/,
  );
  assert.throws(
    () => api.assertApi('gtmOnSuccess').wasCalledTwice(),
    /not implemented by this runner/,
  );
});

test('the newly added matchers actually assert', () => {
  const { api } = buildTestApi(sandboxSource);
  const { assertThat } = api;

  // Each matcher must both accept a passing value and reject a failing one; a
  // matcher that never throws would make every scenario using it a no-op.
  assertThat(true).isTrue();
  assert.throws(() => assertThat(false).isTrue(), /expected true/);

  assertThat('abc').hasLength(3);
  assert.throws(() => assertThat('abc').hasLength(4), /expected length 4/);

  assertThat(['a', 'b']).contains('a', 'b');
  assert.throws(() => assertThat(['a']).contains('a', 'b'), /to contain/);

  assertThat(['a', 'b']).containsExactly('b', 'a');
  assert.throws(() => assertThat(['a', 'b']).containsExactly('a'), /expected exactly/);

  assertThat(1).isAnyOf(1, 2);
  assert.throws(() => assertThat(3).isAnyOf(1, 2), /expected one of/);

  assertThat([]).isEmpty();
  assert.throws(() => assertThat(['a']).isEmpty(), /expected empty/);

  assertThat({ a: 1 }).isObject();
  assert.throws(() => assertThat(['a']).isObject(), /expected an object/);
});

test('wasNotCalledWith distinguishes arguments', () => {
  const { api } = buildTestApi(sandboxSource);
  // An unrecognised product warns with a single string argument, which makes the
  // full-arguments comparison easy to state exactly. (injectScript is a poor
  // subject here: it is called with the two GTM callbacks alongside the URL.)
  api.runCode({ id: '5f7dcb32ef1a4f2d3c8b4567', product: 'nope' });

  api.assertApi('logToConsole').wasNotCalledWith('a message that was never logged');
  assert.throws(
    () => api.assertApi('logToConsole')
      .wasNotCalledWith('Axeptio GTM tag: unrecognised product "nope", loading Brands.'),
    /not to be called with/,
  );
});
