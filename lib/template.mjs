// Shared template.tpl tooling for the headless unit runner (test/run-tpl-tests.mjs).
// Pure extraction — no runner-specific behavior lives here.
//
// Ported from axeptio/axeptio-sgtm-public-template, adapted for a WEB template.

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

// --- Parse the .tpl into its ___SECTION___ blocks. ----------------------------
// Markers are only recognised on a line of their own. Matching them anywhere would
// mean a marker written inside a comment or string — easily done, since the code
// and docs discuss these section names — silently splits the file in the wrong
// place, and the section assignment would overwrite the real block with whatever
// followed the stray mention. Duplicates therefore throw rather than last-one-wins.
const MARKER = /^___[A-Z_]+___[ \t]*\r?$/gm;

export function parseTemplate(src) {
  const names = (src.match(MARKER) || []).map((name) => name.trim());
  const chunks = src.split(MARKER);
  const sections = {};
  names.forEach((name, i) => {
    if (Object.prototype.hasOwnProperty.call(sections, name)) {
      throw new Error(`Duplicate section marker ${name} in template.tpl`);
    }
    sections[name] = chunks[i + 1].trim();
  });
  return sections;
}

export function loadTemplate(tplPath) {
  // template.tpl is UTF-8 *with BOM* and must stay that way, so strip the BOM on
  // read rather than "fixing" the file. Left in place it rides along in the first
  // chunk, which is discarded — harmless today, but it would silently corrupt any
  // future check that looks at section content near the top of the file.
  // \uFEFF as an escape, not a literal BOM: a literal is invisible in review and
  // trivially destroyed by an editor or formatter that trims it.
  const src = readFileSync(tplPath, 'utf8').replace(/^\uFEFF/, '');
  const sections = parseTemplate(src);

  // WEB templates use ___SANDBOXED_JS_FOR_WEB_TEMPLATE___; the server-side sibling
  // repo uses ___SANDBOXED_JS_FOR_SERVER___. This is the one structural difference
  // between the two runners.
  const sandboxSource = sections.___SANDBOXED_JS_FOR_WEB_TEMPLATE___;
  if (!sandboxSource) {
    throw new Error('Could not extract ___SANDBOXED_JS_FOR_WEB_TEMPLATE___ from template.tpl');
  }
  // js-yaml v4's load() uses the core schema and cannot construct arbitrary types —
  // it is the safe entry point here. (safeLoad() was removed in v4; "hardening" this
  // into a safeLoad call, as the PyYAML advice would suggest, throws at runtime.)
  const tests = yaml.load(sections.___TESTS___ || '') || {};
  return { sections, sandboxSource, tests };
}

// --- Spies. -------------------------------------------------------------------
export function spy(impl) {
  const fn = (...args) => {
    fn.calls.push(args);
    return typeof impl === 'function' ? impl(...args) : undefined;
  };
  fn.calls = [];
  return fn;
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  // Require b to own every key of a; with equal key counts this guarantees the
  // key sets are identical, so {a: undefined} no longer matches {b: 1}.
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}
