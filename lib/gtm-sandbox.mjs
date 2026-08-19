// GTM sandbox semantics shared by every layer that executes template.tpl's
// sandboxed JS: the headless unit runner (test/run-tpl-tests.mjs), the static
// contract validator (scripts/validate-template.mjs) and the hermetic browser
// suite (e2e/).
//
// Deliberately dependency-free and free of `node:` imports: e2e/serve.mjs serves
// this file straight to the browser as an ES module, so anything platform-specific
// here would break the browser suite. Callers hand in already-parsed JSON.

// --- GTM's value encoding -----------------------------------------------------
// ___WEB_PERMISSIONS___ encodes every value as a tagged object rather than plain
// JSON. The type tags used by a web template are:
//   1 = string, 2 = list, 3 = map (parallel mapKey/mapValue arrays), 8 = boolean.
// Unknown tags are returned untouched so a future GTM addition surfaces as an
// obviously-wrong value in a failing assertion instead of being silently coerced.
export function decodeValue(value) {
  if (value === null || typeof value !== 'object') return value;
  switch (value.type) {
    case 1: return value.string;
    case 8: return value.boolean;
    case 2: return (value.listItem || []).map(decodeValue);
    case 3: {
      const keys = value.mapKey || [];
      const values = value.mapValue || [];
      const out = {};
      keys.forEach((key, i) => { out[decodeValue(key)] = decodeValue(values[i]); });
      return out;
    }
    default: return value;
  }
}

// Flatten ___WEB_PERMISSIONS___ into { publicId: { paramKey: decodedValue } }.
export function parsePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    throw new Error('___WEB_PERMISSIONS___ must be a JSON array');
  }
  const out = {};
  for (const entry of permissions) {
    const instance = entry && entry.instance;
    const publicId = instance && instance.key && instance.key.publicId;
    if (!publicId) throw new Error('permission entry is missing instance.key.publicId');
    const params = {};
    for (const param of instance.param || []) {
      params[param.key] = decodeValue(param.value);
    }
    out[publicId] = params;
  }
  return out;
}

// --- Pattern matching ---------------------------------------------------------
// GTM permission lists (inject_script urls, write_data_layer keyPatterns) allow
// `*` as a wildcard. Split on `*` first and escape each literal segment, so every
// other regex metacharacter stays inert: a dot in a hostname must match a literal
// dot, otherwise https://static.axept.io/sdk.js would also permit
// https://staticXaxeptXio/sdk.js.
function patternToRegExp(pattern) {
  const body = pattern
    .split('*')
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

export function matchesAnyPattern(value, patterns) {
  return (patterns || []).some((pattern) => patternToRegExp(pattern).test(value));
}

// --- Permission checker -------------------------------------------------------
// Models the checks GTM performs *implicitly* when a sandboxed API is called —
// the ones that abort a tag in production but are invisible to unit tests. Google
// documents that "permission checks do not happen on mocked APIs in unit tests",
// so this is intentionally NOT wired into the ___TESTS___ runner, which must stay
// faithful to the GTM UI. It backs the static validator and the browser suite,
// where being stricter than GTM is the entire point.
//
// Each method returns a boolean rather than throwing, so a caller can choose
// between aborting the way GTM would and collecting every violation for one report.
// Keys the consent APIs accept alongside consent types. `region` scopes a default
// to a set of territories and `wait_for_update` is a grace period in milliseconds;
// neither is something access_consent can grant.
const CONSENT_CONTROL_KEYS = new Set(['region', 'wait_for_update']);

export function createPermissionChecker(permissions) {
  const perms = parsePermissions(permissions);

  const consentAccess = (type, mode) => {
    const rows = (perms.access_consent && perms.access_consent.consentTypes) || [];
    const row = rows.find((r) => r.consentType === type);
    return Boolean(row && row[mode]);
  };

  const globalAccess = (key, mode) => {
    const rows = (perms.access_globals && perms.access_globals.keys) || [];
    const row = rows.find((r) => r.key === key);
    return Boolean(row && row[mode]);
  };

  return {
    permissions: perms,

    injectScript: (url) => matchesAnyPattern(url, perms.inject_script && perms.inject_script.urls),

    // setInWindow / copyFromWindow / callInWindow.
    accessGlobals: (key, mode) => globalAccess(key, mode),

    // setDefaultConsentState and updateConsentState both need *write* on every
    // consent type in the object they are handed. One unlisted type fails the whole
    // call, which is what makes an out-of-sync allowedConsentTypes list abort the
    // tag before injectScript ever runs.
    //
    // CONSENT_CONTROL_KEYS are excluded: they travel in the same object but are
    // call options rather than consent types, and access_consent grants nothing for
    // them. Checking them would reject every legitimate setDefaultConsentState call.
    consentWrite: (state) => Object.keys(state || {})
      .filter((key) => !CONSENT_CONTROL_KEYS.has(key))
      .every((type) => consentAccess(type, 'write')),
    consentRead: (type) => consentAccess(type, 'read'),
    unwritableConsentTypes: (state) => Object.keys(state || {})
      .filter((key) => !CONSENT_CONTROL_KEYS.has(key))
      .filter((type) => !consentAccess(type, 'write')),

    getCookies: (name) => {
      const cookies = perms.get_cookies;
      if (!cookies) return false;
      if (cookies.cookieAccess === 'any') return true;
      return (cookies.cookieNames || []).indexOf(name) !== -1;
    },

    // gtagSet writes into the data layer; keyPatterns may contain wildcards.
    writeDataLayer: (key) =>
      matchesAnyPattern(key, perms.write_data_layer && perms.write_data_layer.keyPatterns),

    logging: () => Boolean(perms.logging),
  };
}

// --- GTM's JSON ---------------------------------------------------------------
// Sandboxed JS gets JSON via require('JSON'), and GTM's version does NOT throw on
// malformed input — parse() returns undefined. template.tpl depends on that: it
// calls JSON.parse(raw) and tests the result against undefined to decide whether to
// try decodeUriComponent. Handing the scenarios the native JSON would throw instead,
// so the cookie-decoding branch could never be tested.
export const gtmJson = {
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
export const gtmDecodeUriComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};
