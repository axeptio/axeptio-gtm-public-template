// Stand-in for https://static.axept.io/sdk.js.
//
// The real SDK is a ~700 KB classic script that reads window.axeptioSettings as it
// boots (see the ordering comment in template.tpl). This stub reproduces exactly
// that contract and nothing else: it snapshots what it can see at execution time,
// which is what lets the suite prove setInWindow really ran first in a real browser.
//
// Loading the real bundle here would make a gating test depend on network egress
// and on a CDN's current contents. Two other checks cover the real thing: the
// weekly SDK canary (scripts/check-classic-script.mjs) proves both bundles still
// parse as classic scripts, and the live-container e2e boots the genuine SDK.
//
// Deliberately a classic script, not a module: a module is deferred and would see
// a different world, hiding the very ordering bug this exists to catch.
(function () {
  var params = new URLSearchParams(document.currentScript.src.split('?')[1] || '');
  window.__axeptioStub = {
    // A structured clone would drop functions; the settings object is plain data.
    bootedWith: window.axeptioSettings ? JSON.parse(JSON.stringify(window.axeptioSettings)) : null,
    // The key names, taken from the live object rather than from the copy above:
    // JSON.stringify omits keys whose value is undefined, so the serialised copy
    // cannot tell an absent proxyBaseUrl from one that is present and set to
    // nothing. To the SDK those two are not the same thing, and only this list
    // keeps them apart.
    bootedKeys: window.axeptioSettings ? Object.keys(window.axeptioSettings) : null,
    // The URL the template actually asked for, before the hermetic rewrite.
    requestedUrl: params.get('real'),
    bootedAt: window.performance.now(),
  };

  // The real Brands SDK pushes a Google Consent Mode default of its own as it
  // boots, on top of whatever the GTM template already set. It decides one is
  // needed by scanning the data layer for a gtag-style ['consent','default'] entry
  // — and GTM's setDefaultConsentState never writes one, so the scan always comes
  // up empty and the push always happens. On one reported site that overwrote two
  // types the publisher had configured as granted (see gtm-0y2).
  //
  // Off unless a test asks for it, so every existing scenario is unaffected.
  // Consumed rather than merely read, the same as __geoAnswer in stub-geo.js: it
  // is planted before runTemplate and the harness reset deliberately leaves inputs
  // alone, so clearing it here is what stops a second run inheriting the first
  // one's instruction.
  var ownDefault = window.__axeptioStubConsentDefault;
  delete window.__axeptioStubConsentDefault;
  if (ownDefault) {
    // Pushed as `arguments`, not as an array or an event — that is what
    // `function gtag(){ dataLayer.push(arguments) }` produces, and the shape the
    // runtime's consent model and the live suite's gtagConsentCalls both key on.
    window.dataLayer = window.dataLayer || [];
    (function () {
      window.dataLayer.push(arguments);
    })('consent', 'default', ownDefault);
  }
})();
