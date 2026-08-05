// Unit tests for the .tpl parser itself.
//
// run-tpl-tests.mjs exercises the template's behaviour; this file exercises the
// thing that extracts it. A parser bug here is worse than a failing scenario,
// because it can hand the runner the wrong source and still report all green.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTemplate, loadTemplate } from '../lib/template.mjs';

const tpl = (body) => `___INFO___\n\n{"x": 1}\n\n${body}`;

test('markers are only recognised on a line of their own', () => {
  // The sandboxed source legitimately mentions section names in comments, and the
  // docs discuss them constantly. An inline mention must stay content.
  const sections = parseTemplate(tpl(
    '___SANDBOXED_JS_FOR_WEB_TEMPLATE___\n\n' +
    '// see ___TESTS___ for coverage of this branch\n' +
    'const a = 1;\n',
  ));

  assert.deepEqual(Object.keys(sections), ['___INFO___', '___SANDBOXED_JS_FOR_WEB_TEMPLATE___']);
  assert.match(sections.___SANDBOXED_JS_FOR_WEB_TEMPLATE___, /see ___TESTS___ for coverage/);
  assert.match(sections.___SANDBOXED_JS_FOR_WEB_TEMPLATE___, /const a = 1;/);
});

test('a duplicated marker throws instead of silently overwriting', () => {
  assert.throws(
    () => parseTemplate(tpl('___TESTS___\n\nscenarios: []\n\n___TESTS___\n\nscenarios: []\n')),
    /Duplicate section marker ___TESTS___/,
  );
});

test('trailing whitespace and CRLF line endings still parse', () => {
  const sections = parseTemplate('___INFO___  \r\n\r\n{"x": 1}\r\n');
  assert.deepEqual(Object.keys(sections), ['___INFO___']);
});

test('parsing twice gives the same result', () => {
  // MARKER is a module-level /g regex shared between match() and split(); a
  // lastIndex leak would make the second call differ from the first.
  const src = tpl('___TESTS___\n\nscenarios: []\n');
  assert.deepEqual(parseTemplate(src), parseTemplate(src));
});

test('loadTemplate strips a BOM and finds the WEB sandbox block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'));
  const path = join(dir, 'template.tpl');
  writeFileSync(
    path,
    '\uFEFF___SANDBOXED_JS_FOR_WEB_TEMPLATE___\n\nconst a = 1;\n\n___TESTS___\n\nscenarios: []\n',
    'utf8',
  );

  const { sandboxSource, tests } = loadTemplate(path);
  assert.equal(sandboxSource, 'const a = 1;');
  assert.deepEqual(tests, { scenarios: [] });
});

test('a server-side template is rejected rather than silently running nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'));
  const path = join(dir, 'template.tpl');
  writeFileSync(path, '___SANDBOXED_JS_FOR_SERVER___\n\nconst a = 1;\n', 'utf8');

  assert.throws(() => loadTemplate(path), /Could not extract ___SANDBOXED_JS_FOR_WEB_TEMPLATE___/);
});
