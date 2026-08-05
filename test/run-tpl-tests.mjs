// Headless runner for the GTM custom-template tests embedded in template.tpl.
//
// GTM stores template unit tests as YAML scenarios in the ___TESTS___ section and
// only runs them inside the GTM UI "Tests" tab — Google ships no CLI runner. This
// file reproduces just enough of GTM's Test API (runCode / mock / mockObject /
// assertApi / assertThat / fail) to execute those same scenarios under Node's
// built-in test runner, so the suite gates every PR. The scenarios are the single
// source of truth: they run unchanged here and in the GTM UI.
//
// It runs the REAL sandboxed source extracted from template.tpl (never a copy), so
// a regression in the template's routing makes a scenario fail here.
//
// Ported from axeptio/axeptio-sgtm-public-template; the shimmed APIs differ because
// this is a WEB template (injectScript, consent state, window access) rather than a
// server-side one (HTTP request/response).

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { loadTemplate, spy, deepEqual } from '../lib/template.mjs';

const TPL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'template.tpl');

const { sandboxSource, tests: parsedTests } = loadTemplate(TPL_PATH);
const scenarios = parsedTests.scenarios || [];
const sharedSetup = parsedTests.setup || '';

// --- GTM's JSON. --------------------------------------------------------------
// Sandboxed JS gets JSON via require('JSON'), and GTM's version does NOT throw on
// malformed input — parse() returns undefined. template.tpl depends on that: it
// calls JSON.parse(raw) and tests the result against undefined to decide whether to
// try decodeUriComponent. Handing the scenarios the native JSON would throw instead,
// so the cookie-decoding branch could never be tested.
const gtmJson = {
  parse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  },
  stringify(value) {
    return JSON.stringify(value);
  },
};

// GTM's decodeUriComponent likewise returns undefined rather than throwing on a
// malformed sequence (e.g. a lone '%').
const gtmDecodeUriComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

// --- Per-scenario GTM Test API. -----------------------------------------------
function buildTestApi() {
  const mocks = {};      // explicit mock()/mockObject() overrides
  const apiSpies = {};   // auto-created spies for required()'d APIs not mocked
  const gtmOnSuccess = spy();
  const gtmOnFailure = spy();

  // require() inside the template: a mock wins, else a built-in default, else a
  // cached tracked spy. A bare spy returns undefined, which is the right default
  // for the consent/window APIs and for getCookieValues (no cookie present).
  const defaults = {
    JSON: gtmJson,
    Object,
    decodeUriComponent: gtmDecodeUriComponent,
    makeNumber: Number,
    // Unmocked, permission checks PASS. The alternative default (a bare spy
    // returning undefined) would make queryPermission falsey, so injectScript
    // would never run and every scenario would silently exercise the failure
    // path instead of the behaviour under test.
    queryPermission: () => true,
  };

  const requireShim = (name) => {
    if (name in mocks) return mocks[name];
    if (name in defaults) return defaults[name];
    if (!apiSpies[name]) apiSpies[name] = spy();
    return apiSpies[name];
  };

  const resolveSpy = (name) => {
    if (name === 'gtmOnSuccess') return gtmOnSuccess;
    if (name === 'gtmOnFailure') return gtmOnFailure;
    if (name in mocks) return mocks[name];
    if (name in apiSpies) return apiSpies[name];
    throw new Error(`assertApi: no mock or recorded call for '${name}'`);
  };

  const runCode = (data) => {
    const context = vm.createContext({
      require: requireShim,
      data: Object.assign({}, data, { gtmOnSuccess, gtmOnFailure }),
      Object, Array, JSON, Math, String, Number,
    });
    vm.runInContext(`(function () {\n${sandboxSource}\n})();`, context, { timeout: 2000 });
  };

  const assertApi = (name) => {
    const fn = resolveSpy(name);
    return {
      wasCalled() {
        if (fn.calls.length === 0) throw new Error(`Expected ${name} to be called`);
      },
      wasNotCalled() {
        if (fn.calls.length > 0) throw new Error(`Expected ${name} not to be called`);
      },
      wasCalledWith(...expected) {
        const hit = fn.calls.some((call) => deepEqual(call, expected));
        if (!hit) {
          throw new Error(
            `Expected ${name} to be called with ${JSON.stringify(expected)}; ` +
            `actual calls: ${JSON.stringify(fn.calls)}`,
          );
        }
      },
    };
  };

  const assertThat = (value, msg) => ({
    isEqualTo(expected) {
      if (!deepEqual(value, expected)) {
        throw new Error(`${msg || 'assertThat'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    isStrictlyEqualTo(expected) {
      if (value !== expected) throw new Error(`${msg || 'assertThat'}: expected ${expected}, got ${value}`);
    },
    isUndefined() {
      if (value !== undefined) throw new Error(`${msg || 'assertThat'}: expected undefined, got ${JSON.stringify(value)}`);
    },
    contains(sub) {
      if (typeof value !== 'string' || value.indexOf(sub) === -1) {
        throw new Error(`${msg || 'assertThat'}: expected "${value}" to contain "${sub}"`);
      }
    },
  });

  const mock = (name, impl) => {
    mocks[name] = typeof impl === 'function' ? spy(impl) : impl;
  };
  const mockObject = (name, obj) => {
    const out = {};
    for (const key of Object.keys(obj)) {
      out[key] = typeof obj[key] === 'function' ? spy(obj[key]) : obj[key];
    }
    mocks[name] = out;
  };

  return {
    runCode, mock, mockObject, assertApi, assertThat,
    fail: (m) => { throw new Error(`fail(): ${m || ''}`); },
    log: () => {},
    JSON, Math, Object, Array, String, Number,
  };
}

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
    const api = buildTestApi();
    const context = vm.createContext(api);
    vm.runInContext(`${sharedSetup}\n${scenario.code}`, context, { timeout: 3000 });
  });
}
