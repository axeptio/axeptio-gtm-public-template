// Static file server for the hermetic browser suite.
//
// Zero dependencies on purpose: this repo ships two files to a public gallery and
// its whole toolchain is js-yaml plus Node built-ins. Adding express (or serve, or
// http-server) to hand four files to a headless browser would be the largest
// dependency decision in the repo, made for the least important reason.
//
// Beyond plain files it exposes two derived endpoints so the browser always runs
// the CURRENT template rather than a checked-in copy:
//   /template/sandbox.js       — the real ___SANDBOXED_JS_FOR_WEB_TEMPLATE___
//   /template/permissions.json — the real ___WEB_PERMISSIONS___
//
// Started by playwright.config.mjs; `node e2e/serve.mjs` also works for poking at
// the fixtures by hand.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { loadTemplate } from '../lib/template.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT || 4173);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// Only these directories are reachable. The repo root holds template.tpl and
// LICENSE; there is no reason to serve them raw, and a traversal bug in a test
// server is still a traversal bug.
const SERVABLE_PREFIXES = ['/e2e/', '/lib/'];

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    // The suite asserts on freshly-derived template content; a 304 from a previous
    // run would silently test the old template.
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = normalize(decodeURIComponent(url.pathname));

  try {
    if (path === '/template/sandbox.js') {
      const { sandboxSource } = loadTemplate(join(ROOT, 'template.tpl'));
      return send(res, 200, sandboxSource, CONTENT_TYPES['.js']);
    }
    if (path === '/template/permissions.json') {
      const { sections } = loadTemplate(join(ROOT, 'template.tpl'));
      return send(res, 200, sections.___WEB_PERMISSIONS___, CONTENT_TYPES['.json']);
    }

    if (!SERVABLE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return send(res, 404, `not served: ${path}`);
    }

    const filePath = join(ROOT, path);
    // normalize() has already collapsed any ../ segments; re-check the result is
    // still inside ROOT before touching the filesystem.
    if (!filePath.startsWith(ROOT)) return send(res, 403, 'forbidden');

    const body = await readFile(filePath);
    return send(res, 200, body, CONTENT_TYPES[extname(filePath)] || 'application/octet-stream');
  } catch (err) {
    if (err.code === 'ENOENT') return send(res, 404, `not found: ${path}`);
    // Log the stack rather than returning it. Nothing is lost for debugging —
    // playwright.config.mjs pipes this server's stderr into the test output — and
    // a response body is the wrong place for a stack trace even on a fixture
    // server bound to 127.0.0.1 (CodeQL js/stack-trace-exposure).
    console.error(`fixture server: 500 for ${path}`, err);
    return send(res, 500, 'internal error; see the fixture server log');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`e2e fixture server on http://127.0.0.1:${PORT}`);
});
