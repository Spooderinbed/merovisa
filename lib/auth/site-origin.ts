/**
 * Resolve the public site origin for auth redirects and emailed links.
 *
 * Behind Vercel's load balancer, `new URL(request.url).origin` is the function's INTERNAL
 * host (localhost), so trusting it bounces production sign-ins to localhost. Precedence:
 *   1. NEXT_PUBLIC_SITE_URL — explicit, deterministic (set this in Vercel → can't be wrong)
 *   2. x-forwarded-host / host header — the proxy's public host
 *   3. url.origin — local dev (NODE_ENV=development) or no proxy headers
 */
export function resolveSiteOrigin(request: Request, url: URL = new URL(request.url)): string {
  if (process.env.NODE_ENV === "development") return url.origin;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return url.origin;
}
