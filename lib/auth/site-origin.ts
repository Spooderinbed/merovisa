/**
 * Resolve the public site origin for auth redirects and emailed links.
 *
 * Behind Vercel's load balancer, `new URL(request.url).origin` is the function's INTERNAL
 * host (localhost), so trusting it bounces production sign-ins to localhost. Precedence:
 *   1. NEXT_PUBLIC_SITE_URL — explicit, deterministic (set this in Vercel → can't be wrong)
 *   2. x-forwarded-host / host header — the proxy's public host, but only behind an edge we
 *      know rewrites it, and only if it parses to exactly an origin
 *   3. url.origin — local dev (NODE_ENV=development), or nothing trustworthy said otherwise
 *
 * This is the only place the redirect's host comes from request data rather than
 * configuration, and it controls the ORIGIN half of `${origin}${destination}` in
 * app/auth/callback/route.ts. `safeNext` guards the destination half and nothing else guards
 * this one — hence the two bounds below.
 */
export function resolveSiteOrigin(request: Request, url: URL = new URL(request.url)): string {
  if (process.env.NODE_ENV === "development") return url.origin;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (behindTrustedEdge()) {
    const forwarded = forwardedOrigin(request);
    if (forwarded) return forwarded;
  }
  return url.origin;
}

/**
 * Does this runtime sit behind an edge that rewrites the forwarded host?
 *
 * On Vercel it does: the edge overwrites `x-forwarded-host` with the host the request
 * actually arrived on, so there the header is the proxy speaking rather than the caller
 * (measured against production — a forged header does not move the redirect). Vercel sets
 * these system env vars in every function runtime, and they are configuration, so a request
 * cannot fake its way past this.
 *
 * Anywhere else — a self-hosted deploy behind a proxy that passes the header through — the
 * header is unverified request data, and the only honest thing to do with it is ignore it and
 * fall through. Such a deployment must set NEXT_PUBLIC_SITE_URL; that is what it is for.
 */
function behindTrustedEdge(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

/**
 * The forwarded host as an origin, or null if it is not exactly one.
 *
 * Even behind a trusted edge these values are only as well-formed as the proxy chain that
 * wrote them: a chain comma-joins `x-forwarded-host`, which makes `${proto}://${host}`
 * unparseable and turns the caller's `NextResponse.redirect` into a 500 on the sign-in page.
 *
 * So rather than deny-list the shapes that hurt, parse the candidate and require the parse to
 * BE an origin — an http(s) scheme, and an authority that accounts for the whole header. That
 * last check is what makes `merovisa.vercel.app@evil.example` fail: the parser reads the
 * authority as `evil.example`, which is not what the header said. Returning `URL.origin` then
 * hands callers the parser's own normalization, so nothing can smuggle a path, a credential,
 * or a disguised authority past the `${origin}${destination}` concatenation.
 *
 * Anything rejected here falls through to `url.origin`, which is this app's own URL — never a
 * throw, and never a host a request asked for.
 */
function forwardedOrigin(request: Request): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";

  let parsed: URL;
  try {
    parsed = new URL(`${proto}://${host}`);
  } catch {
    return null;
  }
  // A non-special scheme (`javascript:`) parses and keeps a host, but has no origin — the
  // scheme check is not subsumed by the authority check below.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.host !== host.toLowerCase()) return null;
  return parsed.origin;
}
