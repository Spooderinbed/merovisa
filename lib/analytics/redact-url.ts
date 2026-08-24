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
 * Route prefixes whose NEXT path segment is a secret (MV-194).
 *
 * `/invite/<token>` is the only URL in the product that carries a live bearer credential,
 * and it is there by necessity: the link a counsellor pastes into a chat message IS the
 * token. `redactSearchParams` cannot reach it — a path segment is not a query parameter —
 * so a student clicking their invitation would hand PostHog a working invitation, which is
 * the defect `invitations.token_hash` exists to prevent, one layer up.
 *
 * Cleaning the VALUE rather than switching analytics off for the route, because the cheaper
 * fix does not actually work: `$referrer` and `$session_entry_url` carry the invite URL to
 * every LATER page of the session, so suppressing init on `/invite` alone would ship the
 * token from the dashboard instead.
 */
export const REDACTED_PATH_PREFIXES: readonly string[] = ["/invite/"];

/**
 * The same URL with each secret path segment replaced.
 *
 * Matched by `indexOf` on the prefix rather than by parsing, for the same reason
 * `redactSearchParams` splits by hand: this has to work on a bare `$pathname` as well as on
 * an absolute URL, and a `URL` round trip would rewrite parts of the string that are not
 * ours to change. Over-matching is harmless and deliberate — a `/invite/` appearing deeper
 * in some other path would be redacted too, and nothing downstream needs that segment.
 */
export function redactPathSecrets(url: string): string {
  let redacted = url;
  for (const prefix of REDACTED_PATH_PREFIXES) {
    const at = redacted.indexOf(prefix);
    if (at === -1) continue;
    const start = at + prefix.length;
    let end = redacted.length;
    for (let i = start; i < redacted.length; i += 1) {
      const char = redacted[i];
      if (char === "/" || char === "?" || char === "#") {
        end = i;
        break;
      }
    }
    // `/invite/` with nothing after it is the bare route, not a credential.
    if (end === start) continue;
    redacted = `${redacted.slice(0, start)}${REDACTION_PLACEHOLDER}${redacted.slice(end)}`;
  }
  return redacted;
}

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
 * Families of URL-carrying properties posthog-js BUILDS rather than declares, so
 * an exact-key list cannot keep up with them.
 *
 * `$session_entry_*` is the one that matters and the one the exact list missed.
 * `SessionPropsManager.getSessionProps` (posthog-js `lib/src/session-props.js`)
 * takes each set-once property and re-emits it under a `$session_entry_` prefix —
 * `$current_url` becomes `$session_entry_url` — and posthog then pins that object
 * to the properties of EVERY event for the life of the session. So the href of
 * whatever page a session started on rides along with every later `$pageview` and
 * `$pageleave`; if that page was a submitted search, so does the student's name.
 * The same href IS redacted where posthog hands it over as `$set_once.$current_url`
 * and shipped verbatim here, which is why an exact list looked complete.
 *
 * Matching by SHAPE rather than adding one more literal is the point: the prefix
 * is how posthog constructs the family, so the next member is covered before it
 * exists. Over-matching is harmless — `redactSearchParams` returns a URL carrying
 * none of the parameters byte for byte, so `$session_entry_utm_source` is untouched.
 */
export const URL_PROPERTY_PATTERNS: readonly RegExp[] = [/^\$session_entry_/];

/** Whether a property name is one whose value is a URL we have to clean. */
export function isUrlProperty(key: string): boolean {
  return URL_PROPERTIES.includes(key) || URL_PROPERTY_PATTERNS.some((pattern) => pattern.test(key));
}

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
 *
 * Iterates the properties PRESENT rather than a fixed list of names, which is
 * what lets `isUrlProperty` recognise a family by shape.
 *
 * This reaches property VALUES only. A URL in a property KEY is out of range —
 * `$heatmap_data` is keyed by `window.location.href` — which is why heatmap
 * capture is refused outright in `components/analytics/analytics-provider.tsx`
 * rather than cleaned here.
 */
export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...properties };
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === "string" && isUrlProperty(key)) {
      // Both redactions, composed: one URL can carry a searched name AND a credential.
      sanitized[key] = redactPathSecrets(redactSearchParams(value));
    }
  }
  return sanitized;
}
