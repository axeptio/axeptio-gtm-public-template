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

// The `gtag('consent', …)` calls the page made, as plain arrays. The SDK defines
// gtag the standard way — `function gtag(){ dataLayer.push(arguments) }` — so its
// calls land in the dataLayer as Arguments objects rather than events or arrays.
// Array.from before the value crosses the page boundary: Playwright serialises a
// bare Arguments object as `{}`.
//
// What is NOT counted here is the point. setDefaultConsentState, updateConsentState
// and gtagSet all write to GTM's internal consent model, never to the dataLayer, so
// nothing the template does appears below — checked by loading both fixtures with
// static.axept.io blocked, where the template still ran (Brands still reported
// consentUpdateAlreadySent) and the dataLayer held no Arguments entry at all. Every
// entry counted is therefore the SDK's, on top of whatever the template already set.
async function gtagConsentCalls(page, command) {
  return page.evaluate((wanted) => Array.from(window.dataLayer || [])
    .filter((entry) => Object.prototype.toString.call(entry) === '[object Arguments]')
    .map((entry) => Array.from(entry))
    .filter((args) => args[0] === 'consent' && args[1] === wanted), command);
}

// Counting calls means counting a number that only ever goes up, so there is no
// event to wait for — and waiting for the entry itself would beg the question the
// count is asking. Wait for the dataLayer to stop growing instead: two identical
// lengths a quiet window apart. Only that returns.
//
// The first sample is taken immediately, so an already-stable dataLayer costs one
// quiet window rather than two. Every caller waits this at least once and the live
// suite is the slowest layer there is, so the difference is worth the extra line.
//
// Running out of time while the length is still moving throws rather than returning
// what it has. A count taken mid-flight is not a small measurement error, it is the
// wrong answer in the direction that hides the defect: the Publishers assertion is
// `toBe(0)`, so an under-count is exactly what makes it pass for the wrong reason
// and turns a test.fail into a silent unexpected pass.
async function waitForDataLayerToSettle(page, quietMs = 2_000, timeout = BOOT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  const sample = () => page.evaluate(() => (window.dataLayer || []).length);

  let previous = await sample();
  for (;;) {
    await page.waitForTimeout(quietMs);
    const length = await sample();
    if (length === previous) return length;
    if (Date.now() > deadline) {
      throw new Error(`dataLayer did not settle within ${timeout} ms: ${previous} -> ${length}`);
    }
    previous = length;
  }
}

// Observed against the live container on 2026-08-27 — one entry, pushed after the
// template had already set this tag's defaults through GTM's own API:
//
//   ["consent","default",{"ad_storage":"denied","ad_user_data":"denied",
//    "ad_personalization":"denied","analytics_storage":"denied",
//    "personalization_storage":"denied","functionality_storage":"granted",
//    "security_storage":"granted","wait_for_update":500}]
//
// Note the shape: a global all-denied default covering seven types, none of them
// this tag's configuration. It is the SDK's own idea of a default, not a replay.
test('Publishers: the SDK re-sends a consent default the template already set', async ({ page }) => {
  // sendDefaultIfNeeded(), in tcf-cmp-client/src/google-consent-mode.ts, decides a
  // default is needed by scanning the dataLayer for a gtag-style ['consent','default']
  // entry. GTM's setDefaultConsentState never writes one — see gtagConsentCalls above
  // — so the scan always comes up empty and the SDK sends its own on top. The correct
  // count is 0: by the time the SDK boots the template has already set the defaults
  // this tag is configured with, and a second global default overrides them.
  test.fail(true, "sendDefaultIfNeeded only scans the dataLayer, which GTM's consent API never writes to: TCF SDK re-sends consent default over the template's — tracked as an SDK ask");

  await page.goto(PUBLISHERS);
  await waitForSettings(page);
  // The default goes out during the SDK's consent-mode init, downstream of the TCF
  // API appearing. Waiting on __tcfapi first keeps the settle window honest and short.
  await page.waitForFunction(() => typeof window.__tcfapi === 'function', null, { timeout: BOOT_TIMEOUT });
  await waitForDataLayerToSettle(page);

  const defaults = await gtagConsentCalls(page, 'default');
  // The payload, not just the count: which types were denied is the whole story.
  expect(defaults.length, `gtag consent defaults in dataLayer: ${JSON.stringify(defaults)}`).toBe(0);
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
  // filters to the consent types granted in access_consent; passing the extra key would
  // fail updateConsentState's permission check and abort the tag before injectScript.
  // So the flag below being true is also proof that filtering works against the real
  // permissions — the coupling validate-template.mjs check 4 only enforces statically.
  expect(cookie.$$googleConsentMode.version).toBeDefined();

  // The payoff: the real template parsed the real SDK's cookie and the real
  // updateConsentState call succeeded. Had the permission check failed, the tag would
  // have aborted and axeptioSettings would never appear — a timeout, not a false pass.
  await page.reload();
  const second = await waitForSettings(page);
  expect(second.consentUpdateAlreadySent).toBe(true);

  // And what the SDK does with that head start: nothing. `consentUpdateAlreadySent`
  // exists so the SDK can skip an update the template has already applied, but the
  // string does not occur anywhere in either shipped bundle — /sdk.js or
  // /tcf/sdk.js — so nothing reads it and the update goes out again on boot.
  //
  // The template's early update is invisible in the dataLayer — updateConsentState
  // writes to GTM's consent model — so the entry counted here is the SDK's alone,
  // and it is redundant with the replay the assertion just above proved happened:
  //
  //   ["consent","update",{"analytics_storage":"granted","ad_storage":"granted",
  //    "ad_user_data":"granted","ad_personalization":"granted"}]
  //
  // Asserted as 1 because that is what happens, not as 0 because that is what we
  // would prefer. When the SDK starts honouring the flag this fails, and the number
  // becomes 0 in the same commit that records why.
  await waitForDataLayerToSettle(page);
  const updates = await gtagConsentCalls(page, 'update');
  expect(updates.length, `gtag consent updates in dataLayer: ${JSON.stringify(updates)}`).toBe(1);
});
