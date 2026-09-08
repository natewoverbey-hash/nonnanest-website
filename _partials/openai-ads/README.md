# OpenAI Ads Pixel — Nonnanest

Pixel ID: `3BtUqwjBRU491xrkqEJtib`

## Platform

| Layer | Platform |
|---|---|
| Website | Static HTML, hand-authored, hosted on **GitHub Pages** at `www.nonnanest.com` (see `CNAME`). No build step, no client-side router — every page is a real document request. |
| Store / checkout | **Shopify** (`cdu13a-bk.myshopify.com`), embedded via the **Shopify Buy Button** SDK on `/shop/` with `buttonDestination: "checkout"`. Clicking *Order Now · $329* creates a Shopify checkout and sends the customer to a **Shopify-hosted checkout on a different domain**. |

The split domain is the reason `order_created` is not in this repo.

## Where each call lives

| Event | Location | Trigger |
|---|---|---|
| base Pixel + `init` | [`js/oaiq.js`](../../js/oaiq.js), included at the top of `<head>` on all 38 pages | once per page, guarded by `window.__nnOaiqInstalled` and the SDK's own `if (w.oaiq) return` |
| `page_viewed` | `js/oaiq.js` | `DOMContentLoaded`, guarded per pathname |
| `contents_viewed` | [`shop/index.html`](../../shop/index.html) | `/shop/` finishing load |
| `checkout_started` | `shop/index.html`, via the Buy Button's `openCheckout` event | the SDK beginning the checkout hand-off |
| `order_created` | [`shopify-custom-pixel.js`](./shopify-custom-pixel.js) — **installed in Shopify admin, not here** | Shopify `checkout_completed` |

`page_viewed` is fired on `DOMContentLoaded` rather than inline: the loader sits
above `<title>` in `<head>`, so `document.title` is still empty at parse time.

### Re-stamping the head block

`js/oaiq.js` is included via a marked block that
[`_partials/sync_analytics.py`](../sync_analytics.py) stamps into every
`*.html` in the repo:

```bash
python3 _partials/sync_analytics.py
```

Idempotent, and it walks the repo rather than a hand-maintained list, so new
pages pick the Pixel up automatically. Edit `HEAD_BLOCK` in that script to
change the snippet site-wide.

## Remaining install step (needs Shopify admin — not doable from this repo)

`order_created` is **not live yet.** Install it:

1. Shopify admin → **Settings → Customer events → Add custom pixel**.
2. Name it `OpenAI Ads Pixel`, permission **Analytics**.
3. Paste the whole of `shopify-custom-pixel.js`, **Save**, then **Connect**.

Shopify's `checkout_completed` fires only after payment succeeds, and does not
re-fire on a thank-you-page refresh. `event_id` is set to the Shopify order id.

## Attribution: how `oppref` travels

1. **Landing.** `js/oaiq.js` never rewrites `window.location`, so the `oppref`
   query parameter on the landing URL is left exactly as OpenAI set it.
2. **Across the site.** The Pixel SDK stores it in the first-party `__oppref`
   cookie on `nonnanest.com`, which carries it page to page. `js/oaiq.js` also
   mirrors the landing value into `localStorage` (`nn_oppref`) as a fallback,
   and only writes when `oppref` is actually present on the URL, so an ordinary
   internal page view cannot clobber a stored token.
3. **Into checkout.** `shop/index.html` wraps `client.checkout.create` and
   attaches `oppref` as a checkout **custom attribute**. It lands on the
   Shopify order as a note attribute, which is what bridges the domain gap —
   Shopify's checkout domain cannot read a `nonnanest.com` cookie.

### Known limitation — read before trusting browser-side `order_created`

Shopify custom pixels run in a **sandboxed iframe on a Shopify origin**. The
`__oppref` cookie set on `nonnanest.com` is not readable from there, and the
SDK loaded inside the sandbox cannot re-derive it. The custom pixel reads the
`oppref` order attribute for logging, but there is no documented Pixel
parameter to pass it back to OpenAI.

**Recommended:** send the confirmed order through the **server-side Conversions
API** from a Shopify `orders/paid` webhook, reading `oppref` out of the order's
`note_attributes` and using the **same `event_id` (the Shopify order id)** as
the browser pixel. OpenAI then deduplicates the two deliveries and the
server-side one carries the attribution token.

That webhook is not built yet — it needs the OpenAI Conversions API endpoint,
auth token, and payload spec, plus somewhere to run it (this site is static
hosting with no server).

## Privacy

The site has no cookie-consent banner or consent-management platform today
(nothing matching OneTrust / CookieYes / Osano / Termly / a `gdpr` gate exists
in the repo), and the Pixel is installed the same unconditional way as the
existing GA4 and Meta pixels. If a consent tool is added later, gate
`js/oaiq.js` behind it alongside those two.

## Before going to production

`debug: true` is set in **two** places. Flip both to `false`:

- `js/oaiq.js` → `var DEBUG = true;`
- `shopify-custom-pixel.js` → `debug: true` (edit in the Shopify admin box)
