/**
 * Keeping free text a person typed out of PostHog's URL properties.
 *
 * ## Why this exists
 *
 * The instrumentation spec (`docs/superpowers/specs/2026-06-10-analytics-instrumentation-design.md`
 * §Decisions 2) enabled pageview capture on an explicit premise: *"routes carry no
 * sensitive params"*. MV-170's student list retired that premise. Its search box
 * is a plain GET form, so a counsellor searching for a student puts that student's
 * name or email address in the URL — and `capture_pageview: "history_change"`
 * ships `$current_url` (and `$referrer` on the way out again) to PostHog on every
 * navigation. CLAUDE.md §Architecture Rules: *no sensitive data in URLs, query
 * params, or client-side logs.*
 *
 * ## What it does, and what it deliberately does not
 *
 * The **value** of a free-text parameter is replaced; the parameter itself stays.
 * "Somebody ran a search on this page" is the analytics signal worth having, and
 * *what they searched for* is the part that must not leave the browser. Every
 * other parameter is untouched — utm attribution and `next` are load-bearing for
 * PostHog and are not free text.
 *
 * This does NOT clean the URL bar, the browser history, or the server's request
 * log; only the analytics payload. Keeping the term out of the URL entirely is the
 * other way to fix that, and it costs the shareable, back-button-correct view the
 * page is built around — the trade is recorded on MV-170's card.
 */

/**
 * Query parameters whose value is free text a person typed. `q` is the repo's one
 * search parameter (`app/(app)/workspace/[organizationId]/students/page.tsx`); a
 * future search surface that reuses the name is covered without a code change,
 * and one that picks a different name belongs on this list.
 */
export const REDACTED_SEARCH_PARAMS: readonly string[] = ["q"];

/** Stands in for the value, so the parameter's presence survives the redaction. */
export const REDACTION_PLACEHOLDER = "redacted";

/**
 * PostHog properties that carry a URL. `$referrer` matters as much as
 * `$current_url`: the pageview for the page a counsellor navigates TO carries the
 * search URL they came from.
 */
export const URL_PROPERTIES: readonly string[] = [
  "$current_url",
  "$initial_current_url",
  "$referrer",
  "$initial_referrer",
  "$pathname",
];

/**
 * The same URL with every free-text parameter's value replaced.
 *
 * Split by hand rather than through `new URL()`: this has to work on a relative
 * path (`$pathname`) as well as an absolute URL, and a `URL` round trip would
 * rewrite parts of the string that are not ours to change. A URL carrying none of
 * the parameters is returned byte for byte.
 */
export function redactSearchParams(url: string): string {
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);

  const queryAt = withoutHash.indexOf("?");
  if (queryAt === -1) return url;

  const base = withoutHash.slice(0, queryAt);
  const params = new URLSearchParams(withoutHash.slice(queryAt + 1));
  if (!REDACTED_SEARCH_PARAMS.some((name) => params.has(name))) return url;

  const redacted = new URLSearchParams(
    // Rebuilt from the entries rather than delete-then-append, so a parameter
    // keeps its position and a repeated one keeps both of its slots.
    [...params.entries()].map(([name, value]): [string, string] =>
      REDACTED_SEARCH_PARAMS.includes(name) ? [name, REDACTION_PLACEHOLDER] : [name, value],
    ),
  );
  return `${base}?${redacted.toString()}${hash}`;
}

/**
 * PostHog's `sanitize_properties` hook: every event's properties, on their way
 * out. Returns a new object — mutating PostHog's is not ours to do.
 */
export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...properties };
  for (const key of URL_PROPERTIES) {
    const value = sanitized[key];
    if (typeof value === "string") sanitized[key] = redactSearchParams(value);
  }
  return sanitized;
}
