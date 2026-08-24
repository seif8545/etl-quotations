# Handoff 19b — Text → Pages links on a phone: two bugs

Both fixes are in the **website** repo (`egypt-top-light-travel-v2\egypt-top-light`), not in
`etl-quotations`. **Neither takes effect until that repo is deployed to Cloudflare Pages.**

Reported symptom: `https://egypttoplight.net/pages/shakira-solo-traveller` shows only the
top-left corner of page one on a phone. Reproduced in headless Chromium with iPhone emulation,
using the real `textDocHtml()` output for that row.

---

## 1. `functions/_lib/textDocHtml.js` — the phone layout

The phone media query carried:

```css
.tdoc{transform:scale(calc((100vw - 14px) / 794));transform-origin:top left}
```

**That declaration is invalid CSS and every browser drops it.** A length divided by a number is
a length, and `transform: scale()` takes a number — there is no way to get a unitless ratio out
of `vw` in CSS at all. Confirmed in the render: `getComputedStyle(.tdoc).transform` is `"none"`.

So the 794px sheet laid out at full size inside the `.wrap{overflow-x:hidden}` on the next line,
which is what made it unrecoverable rather than merely ugly — the page could not even be
scrolled sideways. Measured on an iPhone 13 viewport: `documentElement.scrollWidth` 390,
sheet right edge 794.

**Fix:** `<meta name="viewport" content="width=794">` in place of `width=device-width,
initial-scale=1`, and the dead `transform` line deleted.

The page is one fixed-width A4 column and nothing else — no nav, no footer chrome — so telling
the browser to lay it out at its real width and shrink-to-fit is exactly right. Omitting
`initial-scale` is deliberate: that is what makes the browser compute the fit factor itself.

**Why the viewport tag rather than a working `transform`.** A transformed element keeps its
**unscaled** layout height. At 49% scale a two-page document would have left about a page and a
half of blank scroll underneath it, and the original approach would have had that bug too even
if the `calc()` had been valid. Scaling the viewport scales the heights with it, and native
pinch-zoom keeps working (`user-scalable` is untouched, so a client can still zoom in to read).

Measured, whole sheet visible with no horizontal overflow, before → after:

| viewport | before | after |
|---|---|---|
| iPhone 13 (390) | cut off, unscrollable | whole sheet |
| iPhone SE (375) | cut off, unscrollable | whole sheet |
| small Android (360) | cut off, unscrollable | whole sheet |
| phone landscape (844) | whole sheet | whole sheet |
| tablet (768) | **cut off, unscrollable** | whole sheet |
| desktop 1280 | whole sheet | whole sheet, identical |
| narrow desktop 800 | whole sheet | whole sheet, identical |

Desktop browsers ignore viewport tags, so nothing above 830px changed — verified, not assumed.

The 768px tablet was broken too and nobody had reported it.

**Known and accepted:** on a 360px phone the sheet renders at ~45%, so body text is around 5px
until the client pinches. That is inherent to "scale the sheet whole", which is the behaviour
chosen on purpose so the link and the PDF are recognisably the same document. The alternative —
reflowing into a readable single column on phones — was considered and rejected: it throws away
the page-break work the packer did.

`functions/_lib/packageHtml.js` was checked for the same class of bug and does **not** have it.
It is an ordinary responsive page (`max-width:860px`, `width=device-width`, a 640px query). No
change needed, and `/packages/<slug>` links were never broken on phones.

---

## 2. `functions/_middleware.js` — every /pages/ link was served as HTTP 404

Found while chasing the first bug: `WebFetch` returned 404 for the URL, while the same URL
rendered on the owner's phone.

The middleware has an explicit bypass for `/packages/*`, with a long comment explaining exactly
why it is needed. **`/pages/*` was never added to it.** So for every Text → Pages link:

- `resolveSeo('/pages/<slug>')` finds no entry and returns `{ unknown: true }` (`_lib/seo.js`
  line ~1227),
- the unknown branch at the bottom of `_middleware.js` returns the response body with
  **status 404**,
- the rewriter **removes the page's own `<meta name="robots">`** (it strips that tag
  unconditionally) and appends a canonical, og: tags and JSON-LD built for the marketing site —
  onto a private client itinerary,
- and the `X-Robots-Tag: noindex, nofollow` header that `/packages/*` gets was never set.

A browser renders a 404 body without complaint, which is precisely why this went unnoticed: the
page looked fine. What does not work is everything that reads the status line — **link previews
in WhatsApp, iMessage, Slack and Facebook refuse a 404**, and so does any server-side fetch. If
those links have ever looked "dead" when pasted into a chat, this is why.

**Fix:** the existing bypass condition now covers both families:

```js
if (path === '/packages' || path.startsWith('/packages/') || path.startsWith('/pages/')) {
```

`x-edge-seo` reports `bypass-pages` or `bypass-packages` so the two stay distinguishable in
logs. Bare `/pages` is deliberately **not** bypassed — there is no `functions/pages/index.js`,
so it is a genuine unknown route and should keep returning a real 404. `/packages` bare stays
bypassed because `functions/packages/index.js` exists.

Path matching checked against `/packages`, `/packages/<slug>`, `/pages/<slug>`, `/pages`,
`/pagesfoo`, `/`, `/tours`, `/tours/<slug>`, `/api/contact`, `/pages/`.

---

## After deploying, worth confirming

1. `curl -sI https://egypttoplight.net/pages/shakira-solo-traveller` returns **200**, with
   `x-edge-seo: bypass-pages` and `x-robots-tag: noindex, nofollow`.
2. Paste that link into WhatsApp and check a preview card appears.
3. Open it on a real phone — the whole sheet, and pinch-zoom still works.
4. `https://egypttoplight.net/pages` (no slug) still returns 404.

Not verified by me: anything requiring a real deploy, and no real phone was used — the layout
evidence is headless Chromium with mobile emulation, which is what makes the meta viewport tag
take effect at all.
