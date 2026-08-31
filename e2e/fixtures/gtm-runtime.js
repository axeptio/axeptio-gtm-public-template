// GTM's sandboxed-JS runtime, implemented against a real browser.
//
// The ___TESTS___ runner answers "does the template decide correctly?" with every
// API mocked. This answers the two questions it structurally cannot:
//
//   1. Do the permissions actually permit what the code does? GTM checks every
//      permission-scoped API call at runtime and aborts the tag when one fails —
//      but Google documents that "permission checks do not happen on mocked APIs
//      in unit tests", so the unit layer is blind to it by design. Here the checks
//      are REAL: they run against the template's own ___WEB_PERMISSIONS___ and
//      throw the way GTM would.
//   2. Does an SDK loaded as a classic <script> actually see window.axeptioSettings?
//      That contract depends on setInWindow having run before injectScript, on a
//      real document, with real script execution. No amount of mocking shows it.
//
// injectScript is the one deliberate departure: the URL is permission-checked as
// written, then rewritten to a local stub so the suite stays hermetic and offline.
// Checking before rewriting is what keeps the permission assertion honest.

import { createPermissionChecker, gtmJson, gtmDecodeUriComponent } from '/lib/gtm-sandbox.mjs';

export class PermissionError extends Error {
  constructor(permission, detail) {
    super(`permission denied: ${permission} (${detail})`);
    this.name = 'PermissionError';
    this.permission = permission;
  }
}

// Which local stub stands in for which real host. The template injects two
// different kinds of script now — the SDK bundle and the geolocation answer — and
// they are not interchangeable: one boots a CMP, the other assigns two keys onto
// window.axeptioSettings. Keyed on the real URL's HOST so the choice follows what
// the template actually asked for, never what the test expected it to ask for.
const GEO_HOST = 'headless-api.axeptio.tech';

export function createRuntime(permissions, options = {}) {
  const {
    stubUrl = '/e2e/fixtures/stub-sdk.js',
    geoStubUrl = '/e2e/fixtures/stub-geo.js',
  } = options;
  const checker = createPermissionChecker(permissions);

  const calls = [];
  const record = (api, args) => { calls.push({ api, args }); };

  // GTM's consent APIs and gtagSet all land in the data layer in production. The
  // suite asserts on this array the way a Google tag would read it.
  const dataLayer = (window.dataLayer = window.dataLayer || []);

  // GTM's consent model, which the unit layer has no equivalent of: the state
  // isConsentGranted reads back. Every type starts absent, and an absent type reads
  // as GRANTED — Google's own rule for a type nobody set a default for.
  //
  // It is fed from two sources on purpose. The template's own
  // setDefaultConsentState / updateConsentState calls below are the obvious one.
  // The other is gtag-style `arguments` entries pushed into the data layer by
  // anything else on the page, which is how a real page's consent commands reach
  // GTM — and it is the whole reason this model exists: without it a stubbed SDK
  // pushing its own default is inert, and a test that "reproduces" the override
  // proves nothing. See e2e/fixtures/stub-sdk.js.
  const consentModel = {};
  const applyConsent = (state) => {
    for (const type of Object.keys(state || {})) {
      if (type === 'region' || type === 'wait_for_update') continue;
      consentModel[type] = state[type];
    }
  };

  // Drains the gtag-style consent commands the page has pushed. Called on read
  // rather than on push: nothing can subscribe to an Array.prototype.push, and a
  // read-time drain needs no such hook to stay correct.
  let drained = 0;
  const drainGtagConsent = () => {
    for (; drained < dataLayer.length; drained += 1) {
      const entry = dataLayer[drained];
      if (Object.prototype.toString.call(entry) !== '[object Arguments]') continue;
      const args = Array.from(entry);
      if (args[0] === 'consent' && (args[1] === 'default' || args[1] === 'update')) {
        applyConsent(args[2]);
      }
    }
  };

  const api = {
    JSON: gtmJson,
    Object,
    Math,
    makeNumber: Number,
    makeString: String,
    decodeUriComponent: gtmDecodeUriComponent,

    logToConsole: (...args) => {
      record('logToConsole', args);
      if (!checker.logging()) throw new PermissionError('logging', args[0]);
    },

    // Real permission evaluation, unlike the unit runner's `() => true`.
    queryPermission: (name, ...args) => {
      record('queryPermission', [name, ...args]);
      switch (name) {
        case 'inject_script': return checker.injectScript(args[0]);
        case 'access_globals': return checker.accessGlobals(args[1], args[0]);
        case 'get_cookies': return checker.getCookies(args[0]);
        case 'write_data_layer': return checker.writeDataLayer(args[0]);
        case 'access_consent': return checker.consentRead(args[0]);
        case 'logging': return checker.logging();
        default: throw new Error(`queryPermission: unmodelled permission "${name}"`);
      }
    },

    injectScript: (url, onSuccess, onFailure) => {
      record('injectScript', [url]);
      if (!checker.injectScript(url)) throw new PermissionError('inject_script', url);
      const script = document.createElement('script');
      // Hermetic: never leave the machine. The real URL rides along so the test can
      // assert which bundle the template chose. The stub is picked from the real
      // URL's host, after the permission check above, so a template that asked the
      // wrong host gets the wrong stub rather than a quietly working one.
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        host = '';
      }
      const stub = host === GEO_HOST ? geoStubUrl : stubUrl;
      script.src = `${stub}?real=${encodeURIComponent(url)}`;
      script.onload = onSuccess;
      script.onerror = onFailure;
      document.head.appendChild(script);
    },

    copyFromWindow: (key) => {
      record('copyFromWindow', [key]);
      if (!checker.accessGlobals(key, 'read')) throw new PermissionError('access_globals', key);
      return window[key];
    },

    setInWindow: (key, value, overwrite) => {
      record('setInWindow', [key, value, overwrite]);
      if (!checker.accessGlobals(key, 'write')) throw new PermissionError('access_globals', key);
      if (key in window && !overwrite) return false;
      window[key] = value;
      return true;
    },

    getCookieValues: (name) => {
      record('getCookieValues', [name]);
      if (!checker.getCookies(name)) throw new PermissionError('get_cookies', name);
      return document.cookie
        .split('; ')
        .filter((pair) => pair.slice(0, name.length + 1) === `${name}=`)
        .map((pair) => decodeURIComponent(pair.slice(name.length + 1)));
    },

    gtagSet: (key, value) => {
      record('gtagSet', [key, value]);
      if (!checker.writeDataLayer(key)) throw new PermissionError('write_data_layer', key);
      dataLayer.push({ event: 'gtag.set', key, value });
    },

    // Both consent APIs need WRITE on every key they are handed — one unlisted key
    // fails the whole call. This is the check that makes an out-of-sync
    // allowedConsentTypes list abort the tag before the SDK is ever injected.
    setDefaultConsentState: (state) => {
      record('setDefaultConsentState', [state]);
      const denied = checker.unwritableConsentTypes(state);
      if (denied.length > 0) throw new PermissionError('access_consent', denied.join(', '));
      dataLayer.push({ event: 'consent.default', state });
      applyConsent(state);
    },
    updateConsentState: (state) => {
      record('updateConsentState', [state]);
      const denied = checker.unwritableConsentTypes(state);
      if (denied.length > 0) throw new PermissionError('access_consent', denied.join(', '));
      dataLayer.push({ event: 'consent.update', state });
      applyConsent(state);
    },

    // Read-only, and needs READ on the type it asks about rather than write. A type
    // nobody has set reads as granted, which is Google's documented default and the
    // answer a caller has to be able to act on.
    isConsentGranted: (type) => {
      record('isConsentGranted', [type]);
      if (!checker.consentRead(type)) throw new PermissionError('access_consent', type);
      drainGtagConsent();
      return consentModel[type] !== 'denied';
    },

    // A real deferral, not a synchronous call. GTM applies consent writes at event
    // boundaries, so a callLater that ran inline would let a template read back its
    // own writes in the same execution — the exact mistake this API exists to avoid,
    // and the suite would then pass on behaviour that fails in production.
    callLater: (fn) => {
      record('callLater', []);
      setTimeout(fn, 0);
    },
  };

  const require = (name) => {
    if (!(name in api)) throw new Error(`require('${name}') is not modelled by the e2e runtime`);
    return api[name];
  };

  // consentState and calls are read AFTER runTemplate returns, because the two
  // things worth asserting here both happen later: the SDK stub boots on script
  // load, and the template's audit runs on a callLater after that. A snapshot
  // taken at return time would miss both — the same reason window.sdkBoot and
  // window.gtmCallbacks exist in the harness.
  const consentState = () => {
    drainGtagConsent();
    return Object.assign({}, consentModel);
  };

  return { require, calls, checker, consentState };
}
