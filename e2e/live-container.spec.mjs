// Live-container suite: the real template, in a real GTM container, loading the
// real Axeptio SDK.
//
// The hermetic suite proves the template's half of the contract — it runs the real
// sandboxed JS but injects a local stub. This proves the other half, which nothing
// local can: that the genuine bundle, fetched from static.axept.io and triggered by
// a real container, actually reads window.axeptioSettings and renders a banner.
//
// Requires the CI container to be published and the repository variables to be set,
// so it runs only from gtm-e2e.yml, never on a pull request. Everything here talks
// to googletagmanager.com and static.axept.io, so timeouts are generous and failures
// are as likely to mean "a third party is having a bad day" as "the template broke".
// That is precisely why it does not gate merges.

import { test, expect } from '@playwright/test';

const BRANDS = '/e2e/fixtures/live-brands.html';
const PUBLISHERS = '/e2e/fixtures/live-publishers.html';
const CLIENT_ID = process.env.AXEPTIO_TEST_CLIENT_ID;

// The SDK is ~700 KB and arrives after GTM has loaded, evaluated the container and
// fired the tag. Four network round trips before anything is observable.
const BOOT_TIMEOUT = 30_000;

test.beforeEach(async ({ page }) => {
  // A failure here is nearly always the container, not the browser, so surface the
  // page's own console rather than making someone re-run with --debug.
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [page error] ${msg.text()}`);
  });
});

async function waitForSettings(page) {
  await page.waitForFunction(() => Boolean(window.axeptioSettings), null, { timeout: BOOT_TIMEOUT });
  return page.evaluate(() => window.axeptioSettings);
}

// Which bundle the browser actually fetched, as exact pathnames. Asserting on this
// rather than on the tag's configuration is the point: it is the difference between
// "the template decided to load Brands" and "Brands was loaded".
//
// Parsed rather than substring-matched, for two reasons. Hostname: `includes` would
// accept https://evil.example/static.axept.io (CodeQL js/incomplete-url-substring-
// sanitization). Pathname: '/tcf/sdk.js'.includes('/sdk.js') is true, so a substring
// test for the Brands bundle silently passes when only the TCF bundle loaded.
async function loadedSdkPaths(page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => {
        try {
          return new URL(entry.name);
        } catch {
          return null;
        }
      })
      .filter((url) => url && url.hostname === 'static.axept.io')
      .map((url) => url.pathname));
}

test('Brands: the container fires the tag and the real SDK boots', async ({ page }) => {
  await page.goto(BRANDS);

  const settings = await waitForSettings(page);
  expect(settings.clientId).toBe(CLIENT_ID);
  // Proves these settings came from this template rather than a hand-rolled snippet.
  expect(settings.platform).toBe('tms-gtm');
  expect(settings.cookiesVersion).toBe('insideapp-brands');

  // The Brands bundle, not the TCF one — the two live at different paths and the
  // choice is made by the template's product field.
  await expect.poll(() => loadedSdkPaths(page), { timeout: BOOT_TIMEOUT }).toContain('/sdk.js');
  expect(await loadedSdkPaths(page)).not.toContain('/tcf/sdk.js');

  // The SDK read the settings and mounted. This is the assertion the hermetic
  // suite can only simulate, because it stubs the bundle.
  await expect(page.locator('#axeptio_overlay')).toBeAttached({ timeout: BOOT_TIMEOUT });
});

test('Publishers: the TCF build boots and exposes the IAB API', async ({ page }) => {
  await page.goto(PUBLISHERS);

  const settings = await waitForSettings(page);
  expect(settings.clientId).toBe(CLIENT_ID);
  expect(settings.platform).toBe('tms-gtm');

  await expect.poll(() => loadedSdkPaths(page), { timeout: BOOT_TIMEOUT }).toContain('/tcf/sdk.js');

  // __tcfapi is the IAB TCF entry point. Its presence is the cleanest possible
  // evidence that the TCF build — not merely some Axeptio build — is running.
  await page.waitForFunction(() => typeof window.__tcfapi === 'function', null, { timeout: BOOT_TIMEOUT });
});

test('the two fixtures load different bundles', async ({ page }) => {
  // Guards the container's trigger configuration rather than the template. Both
  // tags fired from one trigger at first, which put two competing CMPs on the same
  // page; the symptom was subtle and the cause was not in this repository at all.
  //
  // Compared on the bundle each page fetched, not on anything in axeptioSettings:
  // the template does not copy `product` into the settings object, so asserting on
  // it would pass whatever the container did.
  await page.goto(BRANDS);
  await waitForSettings(page);
  await expect.poll(() => loadedSdkPaths(page), { timeout: BOOT_TIMEOUT }).toContain('/sdk.js');
  const onBrands = await loadedSdkPaths(page);

  await page.goto(PUBLISHERS);
  await waitForSettings(page);
  await expect.poll(() => loadedSdkPaths(page), { timeout: BOOT_TIMEOUT }).toContain('/tcf/sdk.js');
  const onPublishers = await loadedSdkPaths(page);

  expect(onBrands).not.toContain('/tcf/sdk.js');
  expect(onPublishers).not.toContain('/sdk.js');
});

// The cookie the SDK writes and the template reads back. Parsed rather than
// substring-matched so the assertions can name the field they care about.
//
// Raw first, decoded second — the same order of preference template.tpl uses. The
// SDK writes it URL-encoded today, but decoding first is not free: a raw value
// containing a stray `%` makes decodeURIComponent throw, and one containing a
// literal `%xx` would be silently rewritten. Either way the helper would return
// null and the failure would read as "no cookie" rather than "unparseable".
async function readAxeptioCookie(page) {
  return page.evaluate(() => {
    // Split on ';' and trim rather than on '; ': the separator is conventional,
    // not guaranteed, and trimming costs nothing.
    const hit = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('axeptio_cookies='));
    if (!hit) return null;

    const raw = hit.slice('axeptio_cookies='.length);
    const candidates = [raw];
    try {
      candidates.push(decodeURIComponent(raw));
    } catch {
      // Not percent-encoded; the raw candidate still stands.
    }
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // Try the next form.
      }
    }
    return null;
  });
}

test('Brands: accepting writes a cookie the template replays as an early consent update', async ({ page }) => {
  // The round trip no cheaper layer can prove. The unit scenarios feed the parser a
  // hand-written cookie and the hermetic suite stubs the bundle, so both assert that
  // the template handles a cookie *we* wrote. Only here does the real SDK write it.
  await page.goto(BRANDS);

  // Nothing to replay on a first visit, so the flag must be absent. Asserting this
  // before accepting is what stops the final assertion passing on a warm cookie.
  const first = await waitForSettings(page);
  expect(first.consentUpdateAlreadySent).toBeUndefined();
  await expect(page.locator('#axeptio_overlay')).toBeAttached({ timeout: BOOT_TIMEOUT });

  await page.locator('#axeptio_btn_acceptAll').click();

  // The SDK persists the choice asynchronously, hence the poll rather than a wait.
  //
  // Polled on the consent block itself rather than on $$completed. A cookie write
  // replaces the whole value, so in principle $$completed cannot arrive without the
  // rest of that same write — but that reasoning assumes the SDK writes once, which
  // is its business to change, and waiting on the field this test actually depends
  // on costs nothing and cannot race.
  //
  // $$googleConsentMode is the block template.tpl reads. It is written only when the
  // Axeptio project has Google Consent Mode enabled, so this doubles as a check on
  // the CI project's configuration — if it silently loses that setting, the early
  // update stops happening in production too and this is where it surfaces.
  await expect
    .poll(async () => (await readAxeptioCookie(page))?.$$googleConsentMode?.ad_storage,
      { timeout: BOOT_TIMEOUT })
    .toBe('granted');

  const cookie = await readAxeptioCookie(page);
  expect(cookie.$$completed).toBe(true);

  // The cookie also carries `version: 2`, which is NOT a consent type. The template
  // filters to the four types granted in access_consent; passing the extra key would
  // fail updateConsentState's permission check and abort the tag before injectScript.
  // So the flag below being true is also proof that filtering works against the real
  // permissions — the coupling validate-template.mjs check 5 only enforces statically.
  expect(cookie.$$googleConsentMode.version).toBeDefined();

  // The payoff: the real template parsed the real SDK's cookie and the real
  // updateConsentState call succeeded. Had the permission check failed, the tag would
  // have aborted and axeptioSettings would never appear — a timeout, not a false pass.
  await page.reload();
  const second = await waitForSettings(page);
  expect(second.consentUpdateAlreadySent).toBe(true);
});
