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
    // The URL the template actually asked for, before the hermetic rewrite.
    requestedUrl: params.get('real'),
    bootedAt: window.performance.now(),
  };
})();
