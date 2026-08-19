#!/usr/bin/env node
// Static contract checks for template.tpl.
//
// The ___TESTS___ scenarios prove the sandboxed JS *decides* correctly, but they
// call runCode() with a hand-written `data` object and run with permission checks
// stubbed out — exactly as GTM's own unit tests do. So the couplings *between*
// the template's sections are unverified, and breaking one is silent in CI and
// fatal in production:
//
//   * updateConsentState needs write access for EVERY key it is handed. Adding a
//     consent type to allowedConsentTypes without adding it to access_consent
//     aborts the tag before injectScript — the SDK never loads. Today that sync
//     is enforced by a code comment (template.tpl "Keep this list in sync ...").
//   * Renaming a ___TEMPLATE_PARAMETERS___ entry makes the matching data.<name>
//     read undefined for every live tag, while the scenarios stay green.
//   * A new SDK URL not added to inject_script fails queryPermission, so the tag
//     takes the gtmOnFailure path.
//
// This file checks those couplings by reading the real sections and comparing
// them. It collects every violation before exiting so one run reports all of them,
// matching scripts/validate-gallery.py. Scope boundary: validate-gallery.py owns
// the repo/gallery contract (LICENSE, metadata.yaml, categories); this owns the
// internal consistency of template.tpl.
//
// Run directly (`node scripts/validate-template.mjs`) or via `npm test`, which
// executes it through test/template-contract.test.mjs.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTemplate } from '../lib/template.mjs';
import { createPermissionChecker, matchesAnyPattern } from '../lib/gtm-sandbox.mjs';

const TPL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'template.tpl');

// The 51 APIs require() accepts in a web template, from Google's "Custom template
// APIs" reference. Requiring anything else fails to compile in the GTM UI, which
// CI would otherwise only discover via a real container round-trip.
const DOCUMENTED_APIS = new Set([
  'addConsentListener', 'addEventCallback', 'aliasInWindow', 'callInWindow', 'callLater',
  'copyFromDataLayer', 'copyFromWindow', 'createArgumentsQueue', 'createQueue', 'decodeUri',
  'decodeUriComponent', 'encodeUri', 'encodeUriComponent', 'fromBase64', 'generateRandom',
  'getContainerVersion', 'getCookieValues', 'getQueryParameters', 'getReferrerQueryParameters',
  'getReferrerUrl', 'getTimestamp', 'getTimestampMillis', 'getType', 'getUrl', 'gtagSet',
  'injectHiddenIframe', 'injectScript', 'isConsentGranted', 'JSON', 'localStorage',
  'logToConsole', 'makeInteger', 'makeNumber', 'makeString', 'makeTableMap', 'Math', 'Object',
  'parseUrl', 'queryPermission', 'readAnalyticsStorage', 'readCharacterSet', 'readTitle',
  'require', 'sendPixel', 'setCookie', 'setDefaultConsentState', 'setInWindow', 'sha256',
  'templateStorage', 'toBase64', 'updateConsentState',
]);

// Which ___WEB_PERMISSIONS___ entry each API needs. APIs absent from this map need
// no permission (JSON, Object, makeNumber, ...). Used in both directions: a missing
// permission is a production abort, and a declared-but-unneeded one is over-requesting,
// which is a documented reason for the gallery reviewer to reject a template.
const API_PERMISSIONS = {
  logToConsole: 'logging',
  injectScript: 'inject_script',
  injectHiddenIframe: 'inject_script',
  setInWindow: 'access_globals',
  copyFromWindow: 'access_globals',
  callInWindow: 'access_globals',
  aliasInWindow: 'access_globals',
  getCookieValues: 'get_cookies',
  setCookie: 'set_cookies',
  gtagSet: 'write_data_layer',
  copyFromDataLayer: 'read_data_layer',
  setDefaultConsentState: 'access_consent',
  updateConsentState: 'access_consent',
  isConsentGranted: 'access_consent',
  addConsentListener: 'access_consent',
  sendPixel: 'send_pixel',
  localStorage: 'access_local_storage',
  templateStorage: 'access_template_storage',
  readTitle: 'read_title',
  readCharacterSet: 'read_character_set',
  getUrl: 'get_url',
  getReferrerUrl: 'get_referrer_url',
  getReferrerQueryParameters: 'get_referrer_url',
  readAnalyticsStorage: 'read_analytics_storage',
};

// data.<name> reads that legitimately have no ___TEMPLATE_PARAMETERS___ entry.
// gtmOnSuccess/gtmOnFailure are injected by GTM itself; additionalSettings is the
// documented legacy alias kept for tags saved before the field was renamed.
const DATA_KEYS_WITHOUT_PARAMS = new Set(['gtmOnSuccess', 'gtmOnFailure', 'additionalSettings']);

// GROUP is a layout container: its subParams appear as top-level fields on `data`,
// but the group's own name never does.
const CONTAINER_PARAM_TYPES = new Set(['GROUP']);

const uniqueMatches = (source, re, group = 1) =>
  [...new Set([...source.matchAll(re)].map((m) => m[group]))];

// Collect parameter names, descending through GROUP subParams. SIMPLE_TABLE and
// PARAM_TABLE column names are deliberately not collected: they are row keys inside
// the table's value, not fields on `data`.
function collectParamNames(params, out = new Set(), containers = new Set()) {
  for (const param of params) {
    if (CONTAINER_PARAM_TYPES.has(param.type)) {
      containers.add(param.name);
    } else if (param.name) {
      out.add(param.name);
    }
    if (Array.isArray(param.subParams)) collectParamNames(param.subParams, out, containers);
  }
  return { names: out, containers };
}

// PNG IHDR carries width and height as big-endian uint32s at byte offsets 16 and 20.
function pngSize(buffer) {
  const isPng = buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47;
  if (!isPng) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function validateTemplate(tplPath = TPL_PATH) {
  const violations = [];
  const fail = (msg) => violations.push(msg);

  const { sections, sandboxSource } = loadTemplate(tplPath);

  // --- 1. Every structured block must parse. ----------------------------------
  // Only ___INFO___ is parsed anywhere else today (validate-gallery.py, for
  // categories). Malformed JSON in the other two is caught on import into GTM.
  const parsed = {};
  for (const name of ['___INFO___', '___TEMPLATE_PARAMETERS___', '___WEB_PERMISSIONS___']) {
    if (!sections[name]) {
      fail(`${name} is missing from template.tpl`);
      continue;
    }
    try {
      parsed[name] = JSON.parse(sections[name]);
    } catch (err) {
      fail(`${name} is not valid JSON: ${err.message}`);
    }
  }
  // Nothing below can run without the parameters and permissions blocks.
  if (!parsed.___TEMPLATE_PARAMETERS___ || !parsed.___WEB_PERMISSIONS___) return violations;

  let checker;
  try {
    checker = createPermissionChecker(parsed.___WEB_PERMISSIONS___);
  } catch (err) {
    fail(`___WEB_PERMISSIONS___ is malformed: ${err.message}`);
    return violations;
  }
  const declaredPermissions = new Set(Object.keys(checker.permissions));

  // --- 2. data.<name> reads must match declared parameters, both ways. --------
  const { names: paramNames, containers } = collectParamNames(parsed.___TEMPLATE_PARAMETERS___);
  const dataKeys = uniqueMatches(sandboxSource, /\bdata\.([A-Za-z_][A-Za-z0-9_]*)/g);

  for (const key of dataKeys) {
    if (paramNames.has(key) || DATA_KEYS_WITHOUT_PARAMS.has(key)) continue;
    if (containers.has(key)) {
      fail(`data.${key} reads a GROUP, which is a layout container and never a field on data`);
      continue;
    }
    fail(
      `data.${key} is read by the sandboxed JS but has no ___TEMPLATE_PARAMETERS___ entry ` +
      '— live tags would read undefined',
    );
  }
  for (const name of paramNames) {
    if (!dataKeys.includes(name)) {
      fail(`___TEMPLATE_PARAMETERS___ declares "${name}" but the sandboxed JS never reads data.${name}`);
    }
  }

  // --- 3. allowedConsentTypes must be writable via access_consent. ------------
  // The one coupling that currently has no enforcement beyond a code comment.
  const consentListMatch = sandboxSource.match(/allowedConsentTypes\s*=\s*\[([^\]]*)\]/);
  if (!consentListMatch) {
    fail('could not find the allowedConsentTypes array in the sandboxed JS (has it been renamed?)');
  } else {
    const types = uniqueMatches(consentListMatch[1], /(['"])([^'"]+)\1/g, 2);
    if (types.length === 0) fail('allowedConsentTypes is empty');
    const unwritable = checker.unwritableConsentTypes(Object.fromEntries(types.map((t) => [t, true])));
    for (const type of unwritable) {
      fail(
        `allowedConsentTypes includes "${type}" but access_consent does not grant write on it ` +
        '— updateConsentState would throw and abort the tag before injectScript',
      );
    }
  }

  // --- 4. Injected URLs must be covered by inject_script. ---------------------
  // Every absolute URL literal in the sandboxed JS is checked, because the only
  // ones this template contains are the SDK bundles it injects. A future literal
  // used for something else (sendPixel, say) should extend this check rather than
  // be exempted silently.
  for (const url of uniqueMatches(sandboxSource, /(['"])(https?:\/\/[^'"]+)\1/g, 2)) {
    if (!checker.injectScript(url)) {
      fail(`"${url}" appears in the sandboxed JS but is not covered by the inject_script permission`);
    }
  }

  // --- 5. require()d APIs: documented, and permitted. -------------------------
  const required = uniqueMatches(sandboxSource, /require\((['"])([^'"]+)\1\)/g, 2);
  const neededPermissions = new Set();
  for (const api of required) {
    if (!DOCUMENTED_APIS.has(api)) {
      fail(`require('${api}') is not a documented GTM web-template API — the GTM editor would reject it`);
      continue;
    }
    const permission = API_PERMISSIONS[api];
    if (!permission) continue;
    neededPermissions.add(permission);
    if (!declaredPermissions.has(permission)) {
      fail(`require('${api}') needs the "${permission}" permission, which ___WEB_PERMISSIONS___ does not declare`);
    }
  }
  for (const permission of declaredPermissions) {
    if (!neededPermissions.has(permission)) {
      fail(
        `___WEB_PERMISSIONS___ declares "${permission}" but no required API needs it ` +
        '— over-requesting permissions is a documented gallery-review rejection',
      );
    }
  }

  // --- 6. Literal keys passed to permission-scoped APIs. ----------------------
  // Only literal arguments are checked; a computed key is skipped rather than
  // guessed at.
  for (const key of uniqueMatches(sandboxSource, /gtagSet\((['"])([^'"]+)\1/g, 2)) {
    if (!checker.writeDataLayer(key)) {
      fail(`gtagSet('${key}') is not covered by the write_data_layer keyPatterns`);
    }
  }
  for (const key of uniqueMatches(sandboxSource, /setInWindow\((['"])([^'"]+)\1/g, 2)) {
    if (!checker.accessGlobals(key, 'write')) {
      fail(`setInWindow('${key}') is not granted write access by the access_globals permission`);
    }
  }
  for (const name of uniqueMatches(sandboxSource, /getCookieValues\((['"])([^'"]+)\1/g, 2)) {
    if (!checker.getCookies(name)) {
      fail(`getCookieValues('${name}') is not covered by the get_cookies permission`);
    }
  }

  // --- 7. Gallery icon constraints. -------------------------------------------
  // The gallery requires a square icon under 50 KB; an oversized one is the kind
  // of thing a human reviewer files an Issue about days after submission.
  const info = parsed.___INFO___;
  const thumbnail = info && info.brand && info.brand.thumbnail;
  if (typeof thumbnail === 'string' && thumbnail.startsWith('data:')) {
    const base64 = thumbnail.slice(thumbnail.indexOf(',') + 1);
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > 50 * 1024) {
      fail(`___INFO___ brand.thumbnail is ${Math.round(bytes.length / 1024)} KB; the gallery limit is 50 KB`);
    }
    const size = pngSize(bytes);
    if (size && size.width !== size.height) {
      fail(`___INFO___ brand.thumbnail is ${size.width}x${size.height}; the gallery requires a square icon`);
    }
  }

  return violations;
}

// --- CLI ----------------------------------------------------------------------
// `import.meta.main` is not available on Node 20, so compare paths instead.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const violations = validateTemplate();
  if (violations.length > 0) {
    console.error(`template.tpl contract violations (${violations.length}):`);
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }
  console.log('template.tpl contract checks passed.');
}
