// Playwright configuration for the hermetic browser suite (e2e/).
//
// Chromium only, on a plain runner, with a zero-dependency fixture server — the
// lightest shape in the org (mirroring axeptio/sdk rather than the container-based,
// multi-browser setups in widget-client and caas-styleguide). This suite gates PRs,
// so it must be fast, offline and free of secrets.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.mjs/,
  // The suite is hermetic: a retry that passes would be hiding a real race.
  retries: 0,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'hermetic', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://127.0.0.1:${PORT}/e2e/fixtures/hermetic.html`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
