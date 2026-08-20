// Playwright configuration for the browser suites in e2e/.
//
// Two projects, deliberately separated because they answer different questions and
// carry different risk:
//
//   hermetic  Runs on every pull request, including from forks. No secrets, no
//             network egress: the real sandboxed JS with a local stub SDK. Fast
//             and deterministic, so it is safe to gate merges on.
//
//   live      Runs only from gtm-e2e.yml. Loads a real GTM container and the real
//             Axeptio SDK, so it depends on two third-party services and on
//             repository variables being set. Never gates a pull request.
//
// Chromium only, on a plain runner — the lightest shape in the org, mirroring
// axeptio/sdk rather than the container-based multi-browser setups elsewhere.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4173);

// Escape hatch for machines whose DNS blackholes googletagmanager.com — content
// blockers and corporate resolvers both do this, and the symptom is opaque: the
// tag simply never fires and every live assertion times out waiting for settings
// that were never going to arrive.
//
// Overrides resolution for the test browser only, leaving the system untouched:
//   E2E_HOST_RESOLVER_RULES="MAP www.googletagmanager.com 172.217.22.8" npm run e2e:live
//
// Unset in CI, where DNS resolves normally.
const hostResolverRules = process.env.E2E_HOST_RESOLVER_RULES;
const launchOptions = hostResolverRules
  ? { args: [`--host-resolver-rules=${hostResolverRules}`] }
  : {};

export default defineConfig({
  testDir: './e2e',
  // Retries would hide a race in the hermetic suite, which is the one that gates.
  // The live suite is left at zero too: a flake there is a real signal about the
  // container or the CDN, and silently retrying it away defeats the point.
  retries: 0,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'hermetic',
      testMatch: /hermetic\.spec\.mjs/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'live',
      testMatch: /live-container\.spec\.mjs/,
      // Real network: GTM, then the container, then a ~700 KB SDK from a CDN.
      timeout: 90_000,
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://127.0.0.1:${PORT}/e2e/fixtures/hermetic.html`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
