import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/**
 * MV-194 — `/invite/<token>` is the one URL in this product whose PATH carries a live bearer
 * credential, so the site-wide `strict-origin-when-cross-origin` is not enough for it: that
 * policy still sends the full URL to same-origin requests, which means the token would ride
 * in the `Referer` of every fetch, image and navigation the page makes.
 *
 * `no-referrer` sends none, ever.
 *
 * LISTED AFTER the site-wide rule on purpose. Next applies every matching rule, so both
 * `Referrer-Policy` values arrive; the Referrer Policy spec parses the delivered token list
 * left to right and keeps the LAST valid one, so the later, stricter entry is the one that
 * takes effect. Reordering these two silently loosens the page.
 *
 * Consequence worth knowing before adding a form to that page: under `no-referrer` a
 * NAVIGATION POST also sends `Origin: null` (Fetch, "append a request Origin header"), which
 * `app/auth/signout/route.ts` correctly reads as cross-site. `fetch()` is unaffected and
 * carries the real origin, which is what the accept panel uses.
 */
const inviteHeaders = [
  ...securityHeaders.filter((header) => header.key !== "Referrer-Policy"),
  { key: "Referrer-Policy", value: "no-referrer" },
  // The `<meta name="robots">` on the page says the same thing, and this says it to a crawler
  // that never parses the body. An invitation URL in a search index is an invitation anyone
  // can accept.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  //
  // THERE IS DELIBERATELY NO `Cache-Control` HERE, and the absence is a measurement rather
  // than an oversight. `no-store` was added, served, and observed NOT to take: Next writes
  // its own `Cache-Control` for a page route and overwrites whatever this config says, so
  // `/invite/<token>` ships `no-cache, must-revalidate` whatever is written above. Leaving
  // the line in would have been a config entry asserting a property the runtime does not
  // honour — the same overclaim this slice already corrected once, in the page's header.
  //
  // And on inspection the weaker header is sufficient here. A cache can only ever hold this
  // document under a URL that CONTAINS the credential, so a cache hit requires already
  // possessing the token; `no-cache` additionally forces revalidation before any reuse. The
  // token's real exposure is the browser history entry, which no response header reaches.
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/invite/:token*",
        headers: inviteHeaders,
      },
    ];
  },
};

export default nextConfig;
