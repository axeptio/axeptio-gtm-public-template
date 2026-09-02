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
const RESOLVER = '/e2e/fixtures/live-resolver.html';
const CLIENT_ID = process.env.AXEPTIO_TEST_CLIENT_ID;

// The two bundles, as exact pathnames. Everything else static.axept.io serves —
// lazy chunks, fonts, favicons — is not a CMP and must not be counted as one.
const BUNDLE_PATHS = ['/sdk.js', '/tcf/sdk.js'];

// The SDK is ~700 KB and arrives after GTM has loaded, evaluated the container and
// fired the tag. Four network round trips before anything is observable.
const BOOT_TIMEOUT = 30_000;

// Console entries the browser routes through `error` that are not the page
// reporting a failure of its own: the network stack reporting a request it could
// not complete. They are noise here by design — this suite asserts on what the
// template and the SDK do with consent, and a CDN or a marketplace snippet having
// a bad minute says nothing about either. With retries at 0 a single third-party
// hiccup would otherwise turn the run red for a reason no one can act on.
//
// Still printed, because a run where the SDK failed to load is a run whose other
// failures need that context.
const RESOURCE_LOAD_NOISE = [
  // Chromium's own wording for a subresource that 4xx'd, 5xx'd or was blocked.
  /^Failed to load resource/,
  // A network-layer failure surfaced directly: ERR_CONNECTION_RESET, ERR_FAILED,
  // ERR_BLOCKED_BY_CLIENT and the rest of the family.
  /^net::ERR_/,
];

// Page errors this suite tolerates, and the reason each one is tolerated.
//
// Exactly one entry today. A second needs its own reason written here, beside its
// pattern: the defect this assertion exists to prevent is an SDK error scrolling
// past unread, and an allowlist that grows without a stated cause is the same
// defect one step later.
const ALLOWED_PAGE_ERRORS = [
  // A Piano integration configured on the CI Axeptio project. The SDK's marketplace
  // loader evals Piano's snippet, which references `pa` — a global Piano's own tag
  // defines and this bare fixture never loads. Two hooks report the one missing
  // global, `piano` and `piano:init`. Pre-existing, nothing to do with the template,
  // and harmless on a fixture that is not integrating with Piano.
  //
  // Anchored at BOTH ends so the entry cannot quietly cover a second failure that
  // happens to start the same way. The tail allows the stack the SDK appends —
  // it logs the error's `stack`, so the message is several lines — but nothing
  // else: a novel error concatenated onto this one would no longer match.
  /^\[Axeptio marketplace\] piano(:init)? failed: ReferenceError: pa is not defined(\n\s+at .*)*\s*$/,
];

// Console errors and uncaught exceptions raised by the page during the running
// test. Module-level rather than a fixture because a worker runs one test at a
// time, and beforeEach clears it, so nothing leaks in from the previous test.
let pageErrors = [];

test.beforeEach(({ page }) => {
  pageErrors = [];

  // A failure here is nearly always the container, not the browser, so surface the
  // page's own console rather than making someone re-run with --debug.
  const record = (text) => {
    console.log(`  [page error] ${text}`);
    pageErrors.push(text);
  };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Printed either way; only the page's own errors reach the assertion.
    if (RESOURCE_LOAD_NOISE.some((noise) => noise.test(text))) {
      console.log(`  [page error, ignored as resource-load noise] ${text}`);
      return;
    }
    record(text);
  });
  // console.error is not the only way the page can fail. An uncaught exception in
  // the bundle never reaches the console at all, and a bundle that throws on boot
  // is exactly the breakage only this layer can see.
  //
  // The stack, not just the message: an uncaught exception is often the only signal
  // there is, and in a 700 KB minified bundle the message alone rarely says where.
  // The console entries already arrive with their stack attached — the SDK logs the
  // error's `stack` — so both kinds of entry keep the same shape here, and the
  // allowlist patterns already tolerate the frames.
  page.on('pageerror', (error) => record(error.stack || error.message));
});

// Printing was the whole of it before: every run logged the Piano errors and no
// run failed on them, so a genuinely new SDK error would have ridden along in the
// same log. Anything outside the allowlist now fails the test that produced it.
test.afterEach(async ({ page }) => {
  // Console and pageerror events are delivered asynchronously, so one raised in the
  // closing moments of a test can still be in the pipe when this hook runs. A round
  // trip to the page flushes them. Swallowing its own failure is deliberate: a page
  // that has crashed or closed already failed the test, and rethrowing here would
  // replace that report with a less useful one.
  await page.evaluate(() => {}).catch(() => {});

  const unexpected = pageErrors.filter(
    (text) => !ALLOWED_PAGE_ERRORS.some((allowed) => allowed.test(text)));
  // The text is the finding, so the message carries it: a bare `[]` mismatch would
  // send the reader back to the log this assertion replaced.
  expect(unexpected, `page errors outside the allowlist:\n${unexpected.join('\n\n')}`)
    .toEqual([]);
});

async function waitForSettings(page) {
  await page.waitForFunction(() => Boolean(window.axeptioSettings), null, { timeout: BOOT_TIMEOUT });
  return page.evaluate(() => window.axeptioSettings);
}

// The complete key set window.axeptioSettings carries on both fixtures, sorted.
// Asserted as the WHOLE set rather than as a list of fields that must be absent,
// because the interesting failure is a key nobody predicted: an Additional Axeptio
// Settings row added to a CI tag writes whatever key it names straight onto this
// object, and a list of forbidden names would never mention it. This says the tags
// carry these ten and nothing else.
//
// They come from two places in template.tpl, and the difference matters. Nine are
// written by the settings literal at the foot of the file, so their keys exist
// whatever the tag holds. The tenth, consentDefaultAlreadySent, is assigned after
// it behind a test, as are metadataPrefix and proxyBaseUrl — so for those three,
// presence or absence here is a statement about what the CI tags are configured to
// do, not about which keys the template can emit. Absent for the same reason:
// consentUpdateAlreadySent, which needs a consent cookie the two boot tests have
// not yet written.
const EXPECTED_SETTINGS_KEYS = [
  'clientId',
  // Present because all three CI tags have Consent Mode on with a single, global
  // default row (docs/ci-testing.md), which is exactly the condition the template
  // sets this flag under. It tells the SDK not to send a Consent Mode default of
  // its own. A tag with Consent Mode off, or with a region-only table, would not
  // carry it — so this entry is a statement about the CI tags, not about the
  // template, and it is the reason the Consent-Mode-off path has no live coverage.
  'consentDefaultAlreadySent',
  'cookiesVersion',
  'dataLayerName',
  'platform',
  'postConsentUrl',
  'triggerGTMEvents',
  'userCookiesDomain',
  'userCookiesDuration',
  'userCookiesSecure',
];

// Of those ten, the three neither tag fills in. Their keys exist and hold nothing,
// and the distinction is not academic: the SDK filters undefined out of its merge
// (widget-client src/sdk/SDKSettings.ts), so a key carrying undefined leaves the
// SDK's own default alone while a key carrying a VALUE overrides it. Filling one of
// these fields on a CI tag would keep the key set above intact and still change what
// the SDK is handed, so both halves are asserted.
const EMPTY_ON_BOTH_TAGS = ['postConsentUrl', 'userCookiesDomain', 'dataLayerName'];

// What the two CI tags carry beyond the three fields each test already names.
// Shared because both tags are configured identically apart from product and
// cookies version, so a difference between the fixtures here would be a finding
// rather than a fixture detail.
//
// None of this is a property of the template alone — the hermetic suite already
// covers that, with a hand-written data object. What only this layer can say is that
// the pair works: values stored on a real tag, compiled by GTM, arriving on
// window.axeptioSettings in the shape the SDK reads. Changing the tags without
// changing this breaks the suite on purpose; docs/ci-testing.md lists what they hold.
async function expectStoredTagSettings(page) {
  // One read, one moment. window.axeptioSettings is live — the template appends to
  // it and the SDK boots against it on the same page — so separate evaluates would
  // each see a possibly different object and no assertion would describe any one of
  // them. The undefined comparison happens in the page for a second reason: undefined
  // does not survive the Playwright boundary, so a list of values would arrive
  // indistinguishable from a list of real ones. Only the verdict crosses.
  const observed = await page.evaluate((emptyFields) => {
    const settings = window.axeptioSettings;
    return {
      keys: Object.keys(settings).sort(),
      userCookiesDuration: settings.userCookiesDuration,
      userCookiesSecure: settings.userCookiesSecure,
      triggerGTMEvents: settings.triggerGTMEvents,
      carryingAValue: emptyFields.filter((field) => settings[field] !== undefined),
    };
  }, EMPTY_ON_BOTH_TAGS);

  const context = `window.axeptioSettings keys: ${JSON.stringify(observed.keys)}`;
  expect(observed.keys, context).toEqual(EXPECTED_SETTINGS_KEYS);
  expect(observed.carryingAValue, context).toEqual([]);

  // The tag stores this one as the string "180" — the parameter's own defaultValue
  // is the number 180, so GTM can carry either, but a value typed into the field is
  // saved as text and that is what the CI tags hold. makeNumber() in the template
  // coerces it, and toBe is strict, so what is asserted here is the TYPE the SDK
  // receives: the uncoerced string would fail.
  expect(observed.userCookiesDuration).toBe(180);
  // A checkbox and a boolean-valued select, both true on both tags — no coercion
  // step between GTM and the SDK to get wrong.
  expect(observed.userCookiesSecure).toBe(true);
  expect(observed.triggerGTMEvents).toBe(true);
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

// Of those pathnames, the ones that are a CMP bundle. Counting them is how "one
// banner, not two" is asserted without knowing in advance which one it will be.
async function loadedBundles(page) {
  return (await loadedSdkPaths(page)).filter((path) => BUNDLE_PATHS.indexOf(path) !== -1);
}

// The geolocation request the tag made, or null until it has completed. Parsed
// rather than substring-matched for the same reason as loadedSdkPaths: `includes`
// would accept https://evil.example/headless-api.axeptio.tech.
//
// Only the fact of the request is read here, not its status: PerformanceResourceTiming's
// responseStatus is 0 for a cross-origin resource unless the server sends
// Timing-Allow-Origin, and the geolocation service does not (measured: the first
// live run with the resolver tag reported "answered 0"). The status comes from
// askGeolocationService below instead.
async function geolocationLookup(page, wantedPath) {
  return page.evaluate((wanted) => {
    const entry = performance.getEntriesByType('resource').find((candidate) => {
      let url = null;
      try {
        url = new URL(candidate.name);
      } catch {
        return false;
      }
      return url.hostname === 'headless-api.axeptio.tech' && url.pathname === wanted;
    });
    return entry ? { path: wanted } : null;
  }, wantedPath);
}

// The service's answer as the runner sees it. The page cannot read the response
// (a script it injected, on another origin), but the test process can ask the
// same URL from the same machine, and the service locates by the caller's IP —
// so this is the answer the browser got, status and body alike. The contract has
// exactly two successful shapes: 200 assigns a flow and a configuration, 404
// assigns neither. Without the status the test would have to accept either
// outcome and could then never fail; with the body it can also check that what
// the page ended up holding is what the service actually said.
async function askGeolocationService(request, geoPath) {
  const response = await request.get(`https://headless-api.axeptio.tech${geoPath}`, { maxRedirects: 0 });
  const status = response.status();
  // Only a 200 carries an assignment. The match is deliberately loose about the
  // surrounding syntax (property assignment or object literal, either quote
  // style, any whitespace) so a reformatted body still yields the flow: what the
  // test cares about is the value the service assigned, not how it spelt it.
  const flowMatch = status === 200 ? /flowType\s*[:=]\s*["']([^"']*)["']/.exec(await response.text()) : null;
  return { status, flowType: flowMatch ? flowMatch[1] : undefined };
}

// The SDK telling the page it is running, by whichever entry point the answered
// flow provides: the Brands overlay, or the TCF API. One of the two has to appear
// whatever the service answered, which is what makes this the moment after which
// "how many bundles loaded" is a settled number rather than one still going up.
async function waitForCmpBoot(page) {
  await page.waitForFunction(
    () => typeof window.__tcfapi === 'function' || Boolean(document.querySelector('#axeptio_overlay')),
    null,
    { timeout: BOOT_TIMEOUT });
}

// The resolver, end to end: GTM fires the tag, the tag asks Axeptio which
// configuration this visitor should be shown, and the answer decides which bundle
// loads. No other layer can exercise this — the hermetic suite plants the answer
// itself, and the unit scenarios mock both scripts.
//
// The flow is not pinned, because it cannot be: the answer depends on where the
// GitHub runner is, which is Azure and moves. A run from an EU region can
// legitimately get TCF, one from elsewhere Brands, and a project whose targeting
// matches neither gets a 404 and the tag's configured fallback. What IS pinned is
// the relationship between the answer and the outcome, which holds wherever the
// runner sits — and the service's own answer, fetched by the test from the same
// machine, is what makes that a real assertion rather than a list of tolerated
// outcomes. Asserting "Brands loaded" alone would pass on a broken read-back,
// which produces Brands for the wrong reason.
test('Resolver: the geolocation answer decides which bundle loads', async ({ page, request }) => {
  await page.goto(RESOLVER);

  const settings = await waitForSettings(page);
  expect(settings.clientId).toBe(CLIENT_ID);
  // Proves these settings came from this template rather than a hand-rolled snippet.
  expect(settings.platform).toBe('tms-gtm');

  // The tag asked, at the path the inject_script permission covers. Polled: the
  // resource entry appears when the request completes, not when it is made.
  const geoPath = `/public/geolocation/${CLIENT_ID}.js`;
  await expect.poll(() => geolocationLookup(page, geoPath), { timeout: BOOT_TIMEOUT }).not.toBeNull();
  const lookup = await askGeolocationService(request, geoPath);

  // Read AFTER the CMP has booted and only once. Polling a length that can only
  // grow would sit for the whole timeout on the failure that matters most here —
  // two bundles, meaning both of the injected script's callbacks ran and the
  // visitor got two competing CMPs — and then report it as a timeout.
  await waitForCmpBoot(page);
  const bundles = await loadedBundles(page);
  expect(bundles, `static.axept.io bundles loaded: ${JSON.stringify(bundles)}`).toHaveLength(1);

  // Read from the live object rather than from the settings snapshot above: the
  // template writes the resolved settings back in the same callback that injects
  // the bundle, so this key does not exist yet when the tag first runs.
  const flowType = await page.evaluate(() => window.axeptioSettings.flowType);

  if (lookup.status === 200) {
    // A match. The service assigned both keys, so the template had a flow to act
    // on and the bundle must be that flow's — and a read-back that lost the
    // service's assignments shows up here as a missing flowType rather than as a
    // Brands bundle nobody questions.
    expect(['tcf', 'brands'], `the service answered 200 with flowType ${JSON.stringify(lookup.flowType)}`)
      .toContain(lookup.flowType);
    expect(flowType, 'the page holds the flow the service assigned').toBe(lookup.flowType);
    expect(bundles, `flowType ${flowType}`)
      .toEqual([flowType === 'tcf' ? '/tcf/sdk.js' : '/sdk.js']);
  } else if (lookup.status === 404) {
    // No configuration matches this visitor. The service returns the first line
    // only, so nothing is assigned and the tag falls back to its configured
    // product — Brands on this tag. "The fallback loaded nothing" is exactly the
    // failure this branch exists to catch.
    expect(flowType, 'a 404 assigns no flow').toBeUndefined();
    expect(bundles, 'the configured fallback').toEqual(['/sdk.js']);
  } else {
    // 5xx, a redirect, or a request the browser never completed (status 0). None
    // of them is an answer this suite can reason about, and tolerating them
    // silently is how a broken endpoint would look like a passing run.
    expect(lookup.status,
      `the geolocation service answered ${lookup.status}; the contract is 200 (a match) or 404 (no match)`)
      .toBe(200);
  }
});

test('Brands: the container fires the tag and the real SDK boots', async ({ page }) => {
  await page.goto(BRANDS);

  const settings = await waitForSettings(page);
  expect(settings.clientId).toBe(CLIENT_ID);
  // Proves these settings came from this template rather than a hand-rolled snippet.
  expect(settings.platform).toBe('tms-gtm');
  expect(settings.cookiesVersion).toBe('insideapp-brands');

  await expectStoredTagSettings(page);

  // The Brands bundle, not the TCF one — the two live at different paths and the
  // choice is made by the template's product field.
  await expect.poll(() => loadedSdkPaths(page), { timeout: BOOT_TIMEOUT }).toContain('/sdk.js');
  expect(await loadedSdkPaths(page)).not.toContain('/tcf/sdk.js');

  // The SDK read the settings and mounted. This is the assertion the hermetic
  // suite can only simulate, because it stubs the bundle.
  await expect(page.locator('#axeptio_overlay')).toBeAttached({ timeout: BOOT_TIMEOUT });

  // gtagSet DOES reach the dataLayer, unlike the two consent APIs — the correction
  // the gtagConsentCalls comment above now records. developer_id.dNGFkYj is Axeptio's
  // own Google developer id and nothing but this template sets it, so finding it here
  // attributes the entry beyond doubt.
  const sets = await gtagSetCalls(page);
  expect(sets.map((args) => args[1]), `gtag set calls: ${JSON.stringify(sets)}`)
    .toContain('developer_id.dNGFkYj');
});

test('Publishers: the TCF build boots and exposes the IAB API', async ({ page }) => {
  await page.goto(PUBLISHERS);

  const settings = await waitForSettings(page);
  expect(settings.clientId).toBe(CLIENT_ID);
  expect(settings.platform).toBe('tms-gtm');
  await expectStoredTagSettings(page);

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
// What is NOT counted here is the point. setDefaultConsentState and
// updateConsentState write to GTM's internal consent model, never to the dataLayer,
// so no consent command the template issues appears below — checked by loading both
// fixtures with static.axept.io blocked, where the template still ran (Brands still
// reported consentUpdateAlreadySent) and the dataLayer held no `consent` Arguments
// entry at all. Every entry counted is therefore the SDK's, on top of whatever the
// template already set.
//
// gtagSet is NOT in that group, and an earlier version of this comment wrongly said
// it was. It does reach the dataLayer, as `["set", key, value]` Arguments — observed
// on a live customer page carrying this template, which held
// ["set","developer_id.dNGFkYj",true] and ["set","ads_data_redaction",false], both of
// them ours (template.tpl sets the developer id and reads ads_data_redaction from the
// tag's own configuration). It does not affect the counts here because this helper
// filters on args[0] === 'consent', but the claim underpins how the consent counts
// below are attributed, so the accurate half is worth stating precisely.
// gtagSetCalls() pins the correction below.
async function gtagConsentCalls(page, command) {
  return page.evaluate((wanted) => Array.from(window.dataLayer || [])
    .filter((entry) => Object.prototype.toString.call(entry) === '[object Arguments]')
    .map((entry) => Array.from(entry))
    .filter((args) => args[0] === 'consent' && args[1] === wanted), command);
}

// The `gtag('set', …)` calls the page made. Same Arguments shape as the consent
// commands above, and the reason the comment there distinguishes gtagSet from the
// two consent APIs: this one really does reach the dataLayer. Asserted rather than
// merely described, because prose no test holds is how the original claim drifted.
async function gtagSetCalls(page) {
  return page.evaluate(() => Array.from(window.dataLayer || [])
    .filter((entry) => Object.prototype.toString.call(entry) === '[object Arguments]')
    .map((entry) => Array.from(entry))
    .filter((args) => args[0] === 'set'));
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
  // — so the scan always comes up empty and the SDK sends its own on top.
  //
  // Asserted as 1 because that is what happens, in the same idiom as the Brands
  // round-trip test below. The CORRECT count is 0: by the time the SDK boots, the
  // template has already set the defaults this tag is configured with, and a second
  // global all-denied default overrides them. Tracked as an SDK ask in ENG-13518 —
  // when that ships this assertion fails, and the fix is to change the 1 to a 0 in
  // the same commit that records why.
  //
  // Deliberately NOT test.fail(): with an expected status of "failed", a failure in
  // any hook counts as the expected outcome too, so the page-error assertion in
  // afterEach would be inert on this test and a new error on the TCF path would stay
  // green. The count below is the only thing this test is allowed to be lenient about.

  await page.goto(PUBLISHERS);
  await waitForSettings(page);
  // The default goes out during the SDK's consent-mode init, downstream of the TCF
  // API appearing. Waiting on __tcfapi first keeps the settle window honest and short.
  await page.waitForFunction(() => typeof window.__tcfapi === 'function', null, { timeout: BOOT_TIMEOUT });
  await waitForDataLayerToSettle(page);

  const defaults = await gtagConsentCalls(page, 'default');
  // The payload, not just the count: which types were denied is the whole story.
  expect(defaults.length, `gtag consent defaults in dataLayer: ${JSON.stringify(defaults)}`).toBe(1);
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

test('Brands: accepting writes a cookie the template replays as an early consent update', async ({ page, request }) => {
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

  // And what the SDK does with that head start — which is mid-migration, so this
  // assertion deliberately accepts both answers.
  //
  // `consentUpdateAlreadySent` exists so the SDK can skip an update the template
  // has already applied. widget-client#772 (ENG-13516, merged 2026-09-01) makes it
  // do so: loadGoogleConsentModeChoices skips the page-load update only. That is
  // merged but NOT yet on the CDN, so whether the count is 1 or 0 depends on which
  // bundle static.axept.io is serving on the day this runs — and this suite runs on
  // master pushes and a weekly cron, where a red build is detached from any change
  // of ours.
  //
  // The template's early update is invisible in the dataLayer — updateConsentState
  // writes to GTM's consent model — so an entry counted here is the SDK's alone,
  // and it is redundant with the replay the assertion just above proved happened:
  //
  //   ["consent","update",{"analytics_storage":"granted","ad_storage":"granted",
  //    "ad_user_data":"granted","ad_personalization":"granted"}]
  //
  // 0 is the correct outcome and 1 is the pre-#772 one. Both pass; anything else
  // fails. This is NOT a lenient assertion in disguise — 2 would mean the skip
  // broke and the SDK now double-sends, which is the regression worth catching.
  //
  // TIGHTEN THIS to .toBe(0) once the CDN serves the new bundle. Check with:
  //   curl -s https://static.axept.io/sdk.js | grep -c consentUpdateAlreadySent
  //
  // Read through Playwright's request context, NOT page.evaluate(fetch(...)). A
  // cross-origin <script> needs no CORS, which is how the SDK loads at all, but
  // fetch() does - and static.axept.io sends no access-control-allow-origin header
  // (checked 2026-09-01), so an in-page fetch throws and takes the whole test with
  // it rather than answering the question. This runs in the test process instead.
  await waitForDataLayerToSettle(page);
  const updates = await gtagConsentCalls(page, 'update');
  const bundleUrl = 'https://static.axept.io' + BUNDLE_PATHS[0];
  const bundle = await request.get(bundleUrl);
  expect(bundle.ok(), `could not read ${bundleUrl} to tell which SDK is deployed`).toBe(true);
  const honoursFlag = (await bundle.text()).includes('consentUpdateAlreadySent');
  expect(
    updates.length,
    `gtag consent updates in dataLayer: ${JSON.stringify(updates)} ` +
      `(deployed bundle ${honoursFlag ? 'DOES' : 'does not'} reference consentUpdateAlreadySent)`,
  ).toBe(honoursFlag ? 0 : 1);
});
