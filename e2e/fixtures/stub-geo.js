// Stand-in for https://headless-api.axeptio.tech/public/geolocation/{projectId}.js.
//
// The real endpoint locates the visitor from Cloudflare, resolves the project's own
// configurations across both flows, and answers with a script whose entire content
// is three assignments (headless-cmp docs/GTM_INTEGRATION.md):
//
//   window.axeptioSettings = window.axeptioSettings || {};
//   window.axeptioSettings.cookiesVersion = "<configuration id>";
//   window.axeptioSettings.flowType = "tcf" | "brands";
//
// This reproduces exactly that and nothing else. What it answers is planted by the
// test on window.__geoAnswer before runTemplate(), because the real answer depends
// on where the visitor is and no hermetic suite can hold an opinion about that.
//
// With no answer planted it emits the FIRST LINE ONLY — the shape a request that
// matched no configuration produces. That is a real outcome, not an error: the
// script loads, gtmOnSuccess-equivalent fires, and the template has to notice that
// nothing was assigned and keep the configured product.
//
// Deliberately a classic script, like the real one and like stub-sdk.js: the whole
// point of the ordering this suite guards is that neither is deferred.
(function () {
  var params = new URLSearchParams(document.currentScript.src.split('?')[1] || '');

  // Extends whatever is already there rather than replacing it — the tag's own
  // settings were written before this script was injected and must survive.
  window.axeptioSettings = window.axeptioSettings || {};

  // Consumed, not merely read: the answer is a per-run input and the harness's own
  // reset deliberately leaves it alone (it is planted before runTemplate, not
  // during it). Clearing it here is what stops a second run in the same test being
  // told what the first one asked for.
  var answer = window.__geoAnswer;
  delete window.__geoAnswer;
  if (answer) {
    window.axeptioSettings.cookiesVersion = answer.cookiesVersion;
    window.axeptioSettings.flowType = answer.flowType;
  }

  // The URL the template actually asked for, before the hermetic rewrite. The
  // project id is in the path, so this is also how a test proves the tag asked
  // about the project it ended up loading.
  window.__geoStub = {
    requestedUrl: params.get('real'),
    answered: Boolean(answer),
    ranAt: window.performance.now(),
  };
})();
