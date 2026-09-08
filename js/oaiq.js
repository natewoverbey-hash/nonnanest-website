/**
 * OpenAI Ads Pixel — Nonnanest (www.nonnanest.com)
 *
 * Loaded from the <head> of every page. This file is responsible for the
 * SITE-WIDE concerns only:
 *
 *   1. Loading + initialising the base Pixel exactly once per page.
 *   2. Capturing and preserving OpenAI's `oppref` attribution token.
 *   3. Firing `page_viewed` once per page load.
 *
 * Commerce events (`contents_viewed`, `checkout_started`) are NOT fired from
 * here — they live in /shop/index.html so they can only fire when the
 * corresponding action actually happens. `order_created` fires from the
 * Shopify Custom Pixel (see _partials/openai-ads/README.md); checkout is
 * hosted by Shopify on a different domain, so it cannot fire from this site.
 */
(function (w, d) {
  "use strict";

  if (w.__nnOaiqInstalled) { return; }
  w.__nnOaiqInstalled = true;

  var PIXEL_ID = "3BtUqwjBRU491xrkqEJtib";

  // TESTING FLAG — set to false once the events are verified in the
  // OpenAI Ads Manager Pixel diagnostics.
  var DEBUG = true;

  /* ------------------------------------------------------------------ *
   * 1. Base Pixel — initialises once, guarded by `if (w.oaiq) return`.
   * ------------------------------------------------------------------ */
  !function (w, d, s, u) {
    if (w.oaiq) return;
    var q = function () { q.q.push(arguments) };
    q.q = [];
    w.oaiq = q;
    var j = d.createElement(s);
    j.async = 1;
    j.src = u;
    var f = d.getElementsByTagName(s)[0];
    f.parentNode.insertBefore(j, f)
  }(w, d, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");

  oaiq("init", { pixelId: PIXEL_ID, debug: DEBUG });

  /* ------------------------------------------------------------------ *
   * 2. oppref attribution
   *
   * The Pixel SDK stores `oppref` in a first-party `__oppref` cookie on
   * nonnanest.com, which is what carries it across page-to-page navigation
   * on this site. We additionally mirror the landing value into
   * localStorage as a fallback, and expose a reader so the shop page can
   * hand the token to Shopify's off-domain checkout.
   *
   * We deliberately never rewrite window.location — the `oppref` query
   * parameter on the landing URL is left exactly as OpenAI set it.
   * ------------------------------------------------------------------ */
  var OPPREF_MIRROR_KEY = "nn_oppref";

  function opprefFromUrl() {
    try {
      return new URLSearchParams(w.location.search).get("oppref") || "";
    } catch (e) { return ""; }
  }

  function opprefFromCookie() {
    try {
      var m = d.cookie.match(/(?:^|;\s*)__oppref=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : "";
    } catch (e) { return ""; }
  }

  function opprefFromMirror() {
    try { return w.localStorage.getItem(OPPREF_MIRROR_KEY) || ""; } catch (e) { return ""; }
  }

  // Mirror the landing value. Only ever writes when `oppref` is present on
  // the URL, so an ordinary internal page view can't clobber a stored token.
  (function captureOppref() {
    var v = opprefFromUrl();
    if (!v) { return; }
    try { w.localStorage.setItem(OPPREF_MIRROR_KEY, v); } catch (e) {}
  })();

  function getOppref() {
    return opprefFromUrl() || opprefFromCookie() || opprefFromMirror();
  }

  /* ------------------------------------------------------------------ *
   * 3. page_viewed
   *
   * Fired on DOMContentLoaded rather than inline, because this script sits
   * above <title> in the <head> and `document.title` is not populated yet
   * at parse time.
   *
   * Guarded by path so it cannot fire twice for the same page. The site is
   * a static multi-page site today (no client-side router), so this fires
   * exactly once per load. `nnAnalytics.pageViewed()` is exported so that a
   * future router can call it after a completed route change.
   * ------------------------------------------------------------------ */
  var lastPageViewedPath = null;

  function pageViewed() {
    var path = w.location.pathname;
    if (lastPageViewedPath === path) { return; }
    lastPageViewedPath = path;

    oaiq("measure", "page_viewed", {
      type: "contents",
      contents: [{
        id: path,
        name: d.title,
        content_type: "page"
      }]
    });
  }

  function onReady(fn) {
    if (d.readyState === "loading") {
      d.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(pageViewed);

  /* ------------------------------------------------------------------ */
  w.nnAnalytics = {
    pixelId: PIXEL_ID,
    debug: DEBUG,
    getOppref: getOppref,
    pageViewed: pageViewed
  };

})(window, document);
