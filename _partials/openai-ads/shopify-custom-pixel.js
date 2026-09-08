/**
 * OpenAI Ads Pixel — `order_created`
 * Install in Shopify admin: Settings → Customer events → Add custom pixel.
 *
 *   Name:            OpenAI Ads Pixel
 *   Permission:      Analytics
 *   Data sale:       (match your other marketing pixels)
 *
 * Paste this whole file into the code box and click Save, then Connect.
 *
 * WHY THIS LIVES IN SHOPIFY AND NOT ON nonnanest.com
 * --------------------------------------------------
 * nonnanest.com is a static site; the Buy Button hands the customer to a
 * Shopify-hosted checkout on a different domain. There is no order
 * confirmation page on nonnanest.com, so `order_created` cannot fire from
 * the site's own code. Shopify's `checkout_completed` event fires only
 * after payment succeeds and the order exists — never on the checkout page,
 * never on a failed or abandoned payment, and Shopify does not re-fire it
 * when the customer refreshes the thank-you page.
 *
 * `event_id` is the Shopify order id. That is the deduplication key: a
 * repeat delivery of the same order — including one sent through the
 * server-side Conversions API — collapses into one conversion. The
 * localStorage guard below is a second belt for the same problem.
 */
analytics.subscribe("checkout_completed", (event) => {
  try {
    const checkout = (event.data && event.data.checkout) || {};

    // --- Order identity: the dedup key, shared with the Conversions API ---
    const orderId = String(
      (checkout.order && checkout.order.id) || checkout.token || ""
    );
    if (!orderId) { return; }

    // Belt-and-braces idempotency in case a client ever replays the event.
    const seenKey = "oaiq_order_" + orderId;
    try {
      if (window.localStorage.getItem(seenKey)) { return; }
      window.localStorage.setItem(seenKey, "1");
    } catch (e) { /* sandbox may block storage — event_id still dedupes */ }

    // --- Money: OpenAI expects minor units (cents). $329.00 -> 32900 ------
    const total = checkout.totalPrice || {};
    const amountCents = Math.round(parseFloat(total.amount || 0) * 100);
    const currency = total.currencyCode || "USD";

    // --- Line items ------------------------------------------------------
    // `id` is kept aligned with the site's contents_viewed / checkout_started
    // events (see /shop/index.html -> window.NN_PRODUCT) so OpenAI sees one
    // consistent content identity across the whole funnel.
    const lineItems = checkout.lineItems || [];
    const contents = lineItems.map((li) => ({
      id: (li.variant && li.variant.sku) || "sightaware",
      name: (li.variant && li.variant.product && li.variant.product.title) ||
            li.title || "SightAware Baby Monitor",
      content_type: "product",
      quantity: li.quantity || 1
    }));

    // --- oppref -----------------------------------------------------------
    // Attached to the checkout by /shop/index.html as a custom attribute,
    // because the first-party __oppref cookie on nonnanest.com is not
    // readable from Shopify's checkout domain or from this sandbox.
    // Captured here for debugging; the Conversions API is the reliable
    // consumer of it (see README.md).
    const attributes = checkout.attributes || [];
    const opprefAttr = attributes.find((a) => a && a.key === "oppref");
    const oppref = opprefAttr ? opprefAttr.value : "";

    // --- Base Pixel, loaded inside the Shopify pixel sandbox --------------
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
    }(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");

    oaiq("init", {
      pixelId: "3BtUqwjBRU491xrkqEJtib",
      // TESTING FLAG — set to false once verified in Pixel diagnostics.
      debug: true
    });

    if (oppref) { console.log("[oaiq] oppref on order", orderId, oppref); }

    oaiq(
      "measure",
      "order_created",
      {
        type: "contents",
        amount: amountCents,
        currency: currency,
        contents: contents
      },
      {
        event_id: orderId
      }
    );
  } catch (e) {
    console.error("[oaiq] order_created failed", e);
  }
});
