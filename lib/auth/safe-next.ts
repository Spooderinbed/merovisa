/**
 * Any origin works; `.invalid` is reserved by RFC 2606 and can never resolve, so a
 * value that escapes the relative form has nowhere real to point even by accident.
 */
const PLACEHOLDER_ORIGIN = "https://placeholder.invalid";

/**
 * Browsers remove ASCII tab, LF and CR from a URL *after* a server has approved it,
 * and trim leading and trailing C0 controls and spaces. `/<tab>/evil.com` therefore
 * passes a prefix check — it starts with `/`, not with `//` — rides the `Location`
 * header verbatim, and resolves in the browser as `//evil.com`: protocol-relative,
 * off-origin. Reject rather than strip; a sanitised value is a value you then have
 * to re-prove.
 *
 * Written as code-point bounds rather than a regex of escapes: these characters are
 * invisible in a diff, and the ranges are the whole point of the check.
 */
function hasControlOrWhitespace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const c0OrSpace = code <= 0x20; // U+0000–U+001F controls, U+0020 space
    const delOrC1 = code >= 0x7f && code <= 0x9f; // U+007F DEL, U+0080–U+009F controls
    if (c0OrSpace || delOrC1) return true;
  }
  return false;
}

/**
 * A relative destination this app is willing to redirect a visitor to, or `null`.
 *
 * Callers pair it with the safe default — `safeNext(value) ?? "/dashboard"` — so a
 * refusal is a redirect to the dashboard, never an error and never the value itself.
 */
export function safeNext(input: string | null | undefined): string | null {
  if (!input) return null;
  if (hasControlOrWhitespace(input)) return null;
  if (!input.startsWith("/")) return null;
  if (input.startsWith("//")) return null;
  if (input.startsWith("/\\")) return null;

  // The backstop for whatever the checks above do not know to look for: resolve the
  // value the way the browser will, and require that doing so changed nothing. A
  // string the URL parser rewrites is one where this guard and the browser read
  // different destinations, which is the entire shape of a redirect bypass — so an
  // off-origin resolution and a rewritten path are both refusals, not repairs.
  let resolved: URL;
  try {
    resolved = new URL(input, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (resolved.origin !== PLACEHOLDER_ORIGIN) return null;
  if (`${resolved.pathname}${resolved.search}${resolved.hash}` !== input) return null;

  return input;
}
