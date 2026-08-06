#!/usr/bin/env node
//
// Fails if a URL does not parse as a CLASSIC <script>.
//
// Why this exists: template.tpl loads the SDK with GTM's injectScript(), which
// creates a plain <script>. Sandboxed JS cannot set type="module", so an
// ES-module build fails in the worst possible way — the file still returns 200,
// onload still fires, gtmOnSuccess is still called, and the SDK silently never
// initialises. Green tag, no banner, no consent collected. On a TCF property
// that is a compliance failure that looks fine.
//
// DO NOT rewrite this using `node --check`. Node >= 20 detects module syntax,
// so `node --check` PASSES on an ES module and the canary would be permanently
// blind to the exact regression it exists to catch:
//
//     printf 'const a=1;\nexport{a};' | node --check   # exits 0 on node 22
//
// vm.Script is what a classic <script> actually does: it compiles the source in
// script goal, where `export` / top-level `import` are syntax errors. It only
// compiles — the SDK is never executed here.

import { Script } from 'node:vm';

const urls = process.argv.slice(2);

if (urls.length === 0) {
  console.error('usage: node scripts/check-classic-script.mjs <url> [url...]');
  process.exit(2);
}

let failed = 0;

for (const url of urls) {
  let source;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`FAIL ${url}\n     HTTP ${response.status} ${response.statusText}`);
      failed += 1;
      continue;
    }
    source = await response.text();
  } catch (error) {
    console.error(`FAIL ${url}\n     could not be fetched: ${error.message}`);
    failed += 1;
    continue;
  }

  try {
    // Compile only. Nothing runs.
    new Script(source, { filename: url });
    console.log(`ok   ${url} (${source.length} bytes) parses as a classic script`);
  } catch (error) {
    console.error(
      `FAIL ${url}\n` +
        `     does not parse as a classic script: ${error.message}\n` +
        '     If this is an ES-module build, GTM\'s injectScript() will load it\n' +
        '     without error and the SDK will never initialise. Revert the bundle\n' +
        '     to an IIFE / classic build before it reaches production.'
    );
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${urls.length} URL(s) failed.`);
  process.exit(1);
}
