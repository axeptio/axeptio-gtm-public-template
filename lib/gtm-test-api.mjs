// GTM's Test API, reimplemented for Node.
//
// GTM stores template unit tests as YAML scenarios in ___TESTS___ and only runs
// them inside the GTM UI "Tests" tab — Google ships no CLI runner. This module
// reproduces the Test API (runCode / mock / mockObject / assertApi / assertThat /
// fail) so those same scenarios execute headlessly against the REAL sandboxed
// source extracted from template.tpl.
//
// Fidelity is the point: a scenario must behave identically here and in the GTM
// UI, in both directions. So the matcher set is the full documented one — a
// scenario written in the GTM UI with isTruthy() or hasLength() must not explode
// here with "not a function" — and anything this runner does not model raises an
// explicit "not implemented" error naming the gap, rather than failing as an
// undefined-property TypeError that reads like a bug in the template.
//
// Deliberately NOT modelled: permission enforcement. Google documents that
// "permission checks do not happen on mocked APIs in unit tests", so queryPermission
// defaults to true here exactly as it does in the GTM UI. The permission couplings
// are covered instead by scripts/validate-template.mjs and the e2e/ browser suite.

import vm from 'node:vm';
import { spy, deepEqual } from './template.mjs';
import { gtmJson, gtmDecodeUriComponent } from './gtm-sandbox.mjs';

const show = (value) => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

// Guard every API surface we hand to a scenario: reading a member this runner does
// not implement throws a message that says so, instead of yielding undefined and
// failing one line later as a TypeError.
function strict(target, label) {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol') return undefined;
      throw new Error(
        `${label}.${String(prop)}() is not implemented by this runner. ` +
        'It may still be valid in the GTM UI — add it to lib/gtm-test-api.mjs.',
      );
    },
  });
}

function assertLength(value, matcher) {
  if (typeof value !== 'string' && !Array.isArray(value)) {
    throw new Error(`${matcher}: expected a string or array, got ${show(value)}`);
  }
}

// Order-insensitive multiset comparison, so containsExactly() does not depend on
// the order the template happens to build an array in.
function sameElements(actual, expected) {
  if (actual.length !== expected.length) return false;
  const remaining = [...expected];
  return actual.every((item) => {
    const index = remaining.findIndex((candidate) => deepEqual(item, candidate));
    if (index === -1) return false;
    remaining.splice(index, 1);
    return true;
  });
}

export function buildTestApi(sandboxSource) {
  const mocks = {};      // explicit mock()/mockObject() overrides
  const apiSpies = {};   // auto-created spies for required()'d APIs not mocked
  // Every API call in the order it happened, across all spies. The per-spy `calls`
  // arrays cannot express "setInWindow ran before injectScript", which is a
  // load-bearing ordering in this template.
  const callLog = [];

  const trackedSpy = (name, impl) => {
    const inner = spy(impl);
    const wrapper = (...args) => {
      callLog.push({ api: name, args });
      return inner(...args);
    };
    wrapper.calls = inner.calls;
    return wrapper;
  };

  const gtmOnSuccess = trackedSpy('gtmOnSuccess');
  const gtmOnFailure = trackedSpy('gtmOnFailure');

  // require() inside the template: a mock wins, else a built-in default, else a
  // cached tracked spy. A bare spy returns undefined, which is the right default
  // for the consent/window APIs and for getCookieValues (no cookie present).
  const defaults = {
    JSON: gtmJson,
    Object,
    decodeUriComponent: gtmDecodeUriComponent,
    makeNumber: Number,
    // Unmocked, permission checks PASS — matching GTM, which does not enforce
    // permissions in unit tests. The alternative default (a bare spy returning
    // undefined) would make queryPermission falsey, so injectScript would never
    // run and every scenario would silently exercise the failure path instead of
    // the behaviour under test.
    queryPermission: () => true,
  };

  const requireShim = (name) => {
    if (name in mocks) return mocks[name];
    if (name in defaults) return defaults[name];
    if (!apiSpies[name]) apiSpies[name] = trackedSpy(name);
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
    const calledWith = (expected) => fn.calls.some((call) => deepEqual(call, expected));
    return strict({
      wasCalled() {
        if (fn.calls.length === 0) throw new Error(`Expected ${name} to be called`);
      },
      wasNotCalled() {
        if (fn.calls.length > 0) throw new Error(`Expected ${name} not to be called`);
      },
      wasCalledWith(...expected) {
        if (!calledWith(expected)) {
          throw new Error(
            `Expected ${name} to be called with ${show(expected)}; actual calls: ${show(fn.calls)}`,
          );
        }
      },
      wasNotCalledWith(...expected) {
        if (calledWith(expected)) {
          throw new Error(`Expected ${name} not to be called with ${show(expected)}`);
        }
      },
    }, `assertApi('${name}')`);
  };

  const assertThat = (value, msg) => {
    const prefix = msg || 'assertThat';
    const check = (ok, detail) => {
      if (!ok) throw new Error(`${prefix}: ${detail}`);
    };
    return strict({
      isUndefined: () => check(value === undefined, `expected undefined, got ${show(value)}`),
      isDefined: () => check(value !== undefined, 'expected a defined value, got undefined'),
      isNull: () => check(value === null, `expected null, got ${show(value)}`),
      isNotNull: () => check(value !== null, 'expected a non-null value, got null'),
      isFalse: () => check(value === false, `expected false, got ${show(value)}`),
      isTrue: () => check(value === true, `expected true, got ${show(value)}`),
      isFalsy: () => check(!value, `expected a falsy value, got ${show(value)}`),
      isTruthy: () => check(Boolean(value), `expected a truthy value, got ${show(value)}`),
      isNaN: () => check(Number.isNaN(value), `expected NaN, got ${show(value)}`),
      isNotNaN: () => check(!Number.isNaN(value), 'expected a value other than NaN'),
      isInfinity: () => check(value === Infinity || value === -Infinity, `expected Infinity, got ${show(value)}`),
      isNotInfinity: () =>
        check(value !== Infinity && value !== -Infinity, 'expected a finite value, got Infinity'),
      isEqualTo: (expected) =>
        check(deepEqual(value, expected), `expected ${show(expected)}, got ${show(value)}`),
      isNotEqualTo: (expected) => check(!deepEqual(value, expected), `expected something other than ${show(expected)}`),
      isStrictlyEqualTo: (expected) =>
        check(value === expected, `expected ${show(expected)} (strict), got ${show(value)}`),
      isNotStrictlyEqualTo: (expected) =>
        check(value !== expected, `expected something strictly other than ${show(expected)}`),
      isAnyOf: (...expected) =>
        check(expected.some((e) => deepEqual(value, e)), `expected one of ${show(expected)}, got ${show(value)}`),
      isNoneOf: (...expected) =>
        check(!expected.some((e) => deepEqual(value, e)), `expected none of ${show(expected)}, got ${show(value)}`),
      isGreaterThan: (expected) => check(value > expected, `expected > ${show(expected)}, got ${show(value)}`),
      isGreaterThanOrEqualTo: (expected) =>
        check(value >= expected, `expected >= ${show(expected)}, got ${show(value)}`),
      isLessThan: (expected) => check(value < expected, `expected < ${show(expected)}, got ${show(value)}`),
      isLessThanOrEqualTo: (expected) =>
        check(value <= expected, `expected <= ${show(expected)}, got ${show(value)}`),
      // Variadic and array-aware, matching GTM: on a string it is a substring test,
      // on an array a membership test, and every argument must be present.
      contains: (...expected) => {
        assertLength(value, 'contains');
        const has = (item) => (Array.isArray(value)
          ? value.some((entry) => deepEqual(entry, item))
          : value.indexOf(item) !== -1);
        const missing = expected.filter((item) => !has(item));
        check(missing.length === 0, `expected ${show(value)} to contain ${show(missing)}`);
      },
      doesNotContain: (...expected) => {
        assertLength(value, 'doesNotContain');
        const has = (item) => (Array.isArray(value)
          ? value.some((entry) => deepEqual(entry, item))
          : value.indexOf(item) !== -1);
        const present = expected.filter(has);
        check(present.length === 0, `expected ${show(value)} not to contain ${show(present)}`);
      },
      containsExactly: (...expected) => {
        check(Array.isArray(value), `containsExactly: expected an array, got ${show(value)}`);
        check(sameElements(value, expected), `expected exactly ${show(expected)}, got ${show(value)}`);
      },
      doesNotContainExactly: (...expected) => {
        check(Array.isArray(value), `doesNotContainExactly: expected an array, got ${show(value)}`);
        check(!sameElements(value, expected), `expected something other than exactly ${show(expected)}`);
      },
      hasLength: (expected) => {
        assertLength(value, 'hasLength');
        check(value.length === expected, `expected length ${expected}, got ${value.length}`);
      },
      isEmpty: () => {
        assertLength(value, 'isEmpty');
        check(value.length === 0, `expected empty, got ${show(value)}`);
      },
      isNotEmpty: () => {
        assertLength(value, 'isNotEmpty');
        check(value.length > 0, 'expected a non-empty value');
      },
      isArray: () => check(Array.isArray(value), `expected an array, got ${typeof value}`),
      isBoolean: () => check(typeof value === 'boolean', `expected a boolean, got ${typeof value}`),
      isFunction: () => check(typeof value === 'function', `expected a function, got ${typeof value}`),
      isNumber: () => check(typeof value === 'number', `expected a number, got ${typeof value}`),
      isObject: () =>
        check(typeof value === 'object' && value !== null && !Array.isArray(value),
          `expected an object, got ${show(value)}`),
      isString: () => check(typeof value === 'string', `expected a string, got ${typeof value}`),
    }, 'assertThat(...)');
  };

  const mock = (name, impl) => {
    mocks[name] = typeof impl === 'function' ? trackedSpy(name, impl) : impl;
  };
  const mockObject = (name, obj) => {
    const out = {};
    for (const key of Object.keys(obj)) {
      out[key] = typeof obj[key] === 'function' ? trackedSpy(`${name}.${key}`, obj[key]) : obj[key];
    }
    mocks[name] = out;
  };

  const api = {
    runCode, mock, mockObject, assertApi, assertThat,
    fail: (m) => { throw new Error(`fail(): ${m || ''}`); },
    log: () => {},
    JSON, Math, Object, Array, String, Number,
  };

  // callLog and resolveSpy are runner-side introspection, not part of GTM's Test
  // API — they are returned alongside `api` rather than inside it so a scenario
  // can never reach them and accidentally stop being GTM-portable.
  return { api, callLog, getSpy: resolveSpy };
}
