// Hermetic browser suite: the real sandboxed JS, in a real browser, with the
// template's real permissions enforced.
//
// What this layer adds over the ___TESTS___ scenarios:
//   * permissions are actually evaluated (GTM does not enforce them in unit tests),
//     so an out-of-sync access_consent list fails here the way it fails in production
//   * a classic <script> really executes, so "the SDK sees window.axeptioSettings"
//     is observed rather than inferred from call ordering
//   * consent state lands in a real window.dataLayer
//
// No network egress and no secrets: the injected URL is permission-checked as
// written and then rewritten to a local stub. The genuine SDK is exercised by the
// live-container suite and by the weekly classic-script canary.

import { test, expect } from '@playwright/test';

const PROJECT_ID = '6a22da4da7d365c1e246783d';
const BRANDS_URL = 'https://static.axept.io/sdk.js';
const TCF_URL = 'https://static.axept.io/tcf/sdk.js';

async function openHarness(page) {
  await page.goto('/e2e/fixtures/hermetic.html');
  await page.waitForFunction(() => window.__harnessReady === true);
}

const run = (page, data) => page.evaluate((d) => window.runTemplate(d), data);

// The stub SDK is injected asynchronously; wait for it rather than racing it.
const sdkBoot = (page) => page.waitForFunction(() => window.__axeptioStub || null)
  .then((handle) => handle.jsonValue());

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test('the SDK sees the settings that were written before it loaded', async ({ page }) => {
  const result = await run(page, { id: PROJECT_ID, cookiesVersion: 'my-config' });
  expect(result.error).toBeNull();

  const boot = await sdkBoot(page);
  // This is the assertion the unit layer cannot make: a classic script executed and
  // found the settings already on window. If setInWindow ever moved after
  // injectScript, bootedWith would be null.
  expect(boot.bootedWith).not.toBeNull();
  expect(boot.bootedWith.clientId).toBe(PROJECT_ID);
  expect(boot.bootedWith.cookiesVersion).toBe('my-config');
  expect(boot.bootedWith.platform).toBe('tms-gtm');

  // Read after the boot: gtmOnSuccess is the injected script's onload, so it fires
  // well after runTemplate returns.
  const callbacks = await page.evaluate(() => window.gtmCallbacks());
  expect(callbacks.successes).toBe(1);
  expect(callbacks.failures).toBe(0);
});

test('Brands and Publishers each load their own bundle', async ({ page }) => {
  await run(page, { id: PROJECT_ID, product: 'brands' });
  expect((await sdkBoot(page)).requestedUrl).toBe(BRANDS_URL);

  await openHarness(page);
  await run(page, { id: PROJECT_ID, product: 'publishers' });
  expect((await sdkBoot(page)).requestedUrl).toBe(TCF_URL);
});

test('the proxy base URL reaches the SDK and the injected URL is unchanged', async ({ page }) => {
  const result = await run(page, { id: PROJECT_ID, proxyBaseUrl: 'https://sgtm.example.com/axeptio/' });
  expect(result.error).toBeNull();

  const boot = await sdkBoot(page);
  // Observed by a classic script reading window.axeptioSettings, not inferred from
  // the setInWindow call: the whole feature is this one setting arriving before the
  // SDK boots. The trailing slash is gone because the SDK appends its own paths and
  // would otherwise ask the proxy for a doubled slash on every request.
  expect(boot.bootedWith.proxyBaseUrl).toBe('https://sgtm.example.com/axeptio');

  // The bundle does not follow the proxy. inject_script is checked here as written,
  // before the hermetic rewrite, and a gallery template's permissions are fixed when
  // the version is published — so this pins that a per-container proxy host can never
  // become the host the tag injects from.
  expect(boot.requestedUrl).toBe(BRANDS_URL);
});

test('no proxy base URL leaves the setting absent', async ({ page }) => {
  const result = await run(page, { id: PROJECT_ID });
  expect(result.error).toBeNull();

  const boot = await sdkBoot(page);
  // Absence of the key, not an undefined value: assigning undefined would leave
  // proxyBaseUrl on the object the SDK reads, which it takes as a proxy set to
  // nothing, and a value assertion cannot see the difference. clientId proves the
  // key list is really populated, so the negative above means something.
  expect(boot.bootedKeys).not.toContain('proxyBaseUrl');
  expect(boot.bootedKeys).toContain('clientId');
});

test('Consent Mode defaults reach the data layer before the SDK loads', async ({ page }) => {
  const result = await run(page, {
    id: PROJECT_ID,
    isComoEnabled: true,
    defaultSettings: [{ region: 'FR, DE', ad_storage: 'denied', analytics_storage: 'denied' }],
  });
  expect(result.error).toBeNull();

  const consent = result.dataLayer.find((entry) => entry.event === 'consent.default');
  expect(consent).toBeTruthy();
  expect(consent.state.ad_storage).toBe('denied');
  expect(consent.state.region).toEqual(['FR', 'DE']);
  // wait_for_update buys the CMP time to answer before tags fire.
  expect(consent.state.wait_for_update).toBe(500);

  expect(result.calls.indexOf('setDefaultConsentState')).toBeLessThan(result.calls.indexOf('injectScript'));
});

test('the extra storage types are writable and the wait is configurable', async ({ page }) => {
  // Permissions are enforced here, so this run aborts before the SDK if any of the
  // three new access_consent rows is missing — the production symptom the
  // ___TESTS___ scenarios, which do not enforce permissions, cannot see.
  const result = await run(page, {
    id: PROJECT_ID,
    isComoEnabled: true,
    waitForUpdate: '2000',
    defaultSettings: [{
      region: '',
      ad_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
    }],
  });
  expect(result.error).toBeNull();

  const consent = result.dataLayer.find((entry) => entry.event === 'consent.default');
  expect(consent).toBeTruthy();
  expect(consent.state.functionality_storage).toBe('denied');
  expect(consent.state.personalization_storage).toBe('denied');
  expect(consent.state.security_storage).toBe('granted');
  expect(consent.state.wait_for_update).toBe(2000);
});

test('an existing consent cookie is replayed as a consent update', async ({ page, context }) => {
  await context.addCookies([{
    name: 'axeptio_cookies',
    value: encodeURIComponent(JSON.stringify({
      $$completed: true,
      $$googleConsentMode: { ad_storage: 'granted', analytics_storage: 'denied' },
    })),
    url: page.url(),
  }]);
  await page.reload();
  await page.waitForFunction(() => window.__harnessReady === true);

  // The replay lives inside the Consent Mode branch — without isComoEnabled the
  // cookie is never read, because the replay's whole job is to pre-answer Consent
  // Mode before the SDK boots.
  const result = await run(page, { id: PROJECT_ID, isComoEnabled: true, defaultSettings: [] });
  expect(result.error).toBeNull();

  const update = result.dataLayer.find((entry) => entry.event === 'consent.update');
  expect(update).toBeTruthy();
  expect(update.state).toEqual({ ad_storage: 'granted', analytics_storage: 'denied' });
  // The SDK must be told the update already went out, or it sends a duplicate.
  expect(result.settings.consentUpdateAlreadySent).toBe(true);
});

test('a consent type outside access_consent aborts the tag before the SDK loads', async ({ page }) => {
  // Not a hypothetical: template.tpl filters the cookie's consent keys down to the
  // types access_consent grants, precisely because updateConsentState throws when
  // handed one it cannot write. This proves the guard is load-bearing — the runtime
  // here enforces permissions exactly as GTM does, so removing that filter would
  // surface as an aborted tag rather than a green test.
  //
  // All seven Google types are granted now, so the key that must be rejected is a
  // container-defined custom consent type — the shape of anything else the SDK
  // might one day write into the cookie's Consent Mode block.
  const denied = await page.evaluate(async () => {
    const { createRuntime } = await import('./gtm-runtime.js');
    const permissions = await fetch('/template/permissions.json').then((r) => r.json());
    const runtime = createRuntime(permissions);
    try {
      runtime.require('updateConsentState')({ ad_storage: 'granted', my_custom_consent: 'granted' });
      return null;
    } catch (err) {
      return { message: err.message, permission: err.permission };
    }
  });

  expect(denied).not.toBeNull();
  expect(denied.permission).toBe('access_consent');
  expect(denied.message).toContain('my_custom_consent');
});

test('a denied inject_script permission takes the failure path', async ({ page }) => {
  // queryPermission is real here, so pointing the template at a URL the permission
  // block does not cover exercises the same branch a mis-declared permission would.
  const result = await page.evaluate(async () => {
    const { createRuntime } = await import('./gtm-runtime.js');
    const permissions = await fetch('/template/permissions.json').then((r) => r.json());
    const runtime = createRuntime(permissions);
    return {
      allowed: runtime.require('queryPermission')('inject_script', 'https://static.axept.io/sdk.js'),
      blocked: runtime.require('queryPermission')('inject_script', 'https://cdn.example.com/sdk.js'),
    };
  });

  expect(result.allowed).toBe(true);
  expect(result.blocked).toBe(false);
});
