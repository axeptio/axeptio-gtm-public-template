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

// --- Template equivalence for the CI sync. ------------------------------------
// scripts/push-template-to-gtm.mjs decides whether to publish by asking whether the
// container's copy still matches template.tpl. A byte comparison is the obvious
// implementation, and it does not work — for two reasons that have each cost a bug:
//
//   * template.tpl is UTF-8 WITH BOM. Whether that leading U+FEFF survives a round
//     trip through create_version and publish is GTM's business, not ours, and a
//     one-character difference is indistinguishable from a real edit.
//   * GTM re-serialises the JSON blocks when it stores a template, escaping
//     ' = & < > as \uXXXX. template.tpl is kept in that form (check 2 of
//     scripts/validate-template.mjs), but relying on that leaves the comparison one
//     hand-edit away from republishing on every run, forever.
//
// So compare meaning rather than bytes: the JSON blocks as parsed values, everything
// else as trimmed text. parseTemplate already trims each section, so trailing
// whitespace needs no special handling here.
const JSON_SECTIONS = new Set(['___INFO___', '___TEMPLATE_PARAMETERS___', '___WEB_PERMISSIONS___']);

// \uFEFF as an escape, not a literal: a literal BOM is invisible in review and
// trivially destroyed by an editor that trims it — the same reasoning as loadTemplate.
export function stripBom(src) {
  return (src || '').replace(/^\uFEFF/, '');
}

// Key order is not meaningful in JSON and GTM has no obligation to preserve it.
// Canonicalising sidesteps that, and avoids depending on deepEqual's treatment of
// arrays versus objects, which is looser than this comparison wants.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const body = Object.keys(value).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

// Returns { equal, differences }, where differences name each section that differs.
// The naming matters: "changed=true" was the only signal the sync produced, which is
// how an always-republish bug ran unnoticed for five days.
export function compareTemplates(localSrc, storedSrc) {
  const differences = [];
  const parseSide = (src, label) => {
    try {
      return parseTemplate(stripBom(src));
    } catch (err) {
      differences.push(`${label} could not be parsed: ${err.message}`);
      return null;
    }
  };

  const local = parseSide(localSrc, 'template.tpl');
  const stored = parseSide(storedSrc, 'the stored template');
  if (!local || !stored) return { equal: false, differences };

  for (const name of new Set([...Object.keys(local), ...Object.keys(stored)])) {
    const a = local[name];
    const b = stored[name];

    if (a === undefined) {
      differences.push(`${name} is in the container but not in template.tpl`);
      continue;
    }
    if (b === undefined) {
      differences.push(`${name} is in template.tpl but not in the container`);
      continue;
    }
    if (a === b) continue;

    if (JSON_SECTIONS.has(name)) {
      try {
        if (canonicalJson(JSON.parse(a)) !== canonicalJson(JSON.parse(b))) {
          differences.push(`${name} differs after parsing — a real content change`);
        }
        continue;
      } catch {
        // Invalid JSON on one side; fall through to the text compare so a malformed
        // block is reported rather than silently treated as equal.
      }
    }

    differences.push(`${name} differs (${a.length} chars locally, ${b.length} stored)`);
  }

  return { equal: differences.length === 0, differences };
}
