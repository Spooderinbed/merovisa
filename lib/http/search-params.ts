/**
 * The truthful type of one Next.js `searchParams` value, and the one place a
 * page collapses it.
 *
 * A page that declares `{ next?: string }` is describing the URL it hopes for,
 * not the one a visitor can type: Next hands a **repeated** query parameter
 * (`?next=/a&next=/b`) through as `string[]`. Everything downstream — the
 * `safeNext` guard, a `=== "1"` comparison, a component prop typed `string` —
 * is written for a single value, so the collapse belongs at the boundary,
 * once, rather than as a defensive check at each use.
 *
 * Framework-neutral on purpose (no `server-only`): this is a shape, not a rule.
 */
export type SearchParamValue = string | string[] | undefined;

/**
 * The first value of a possibly-repeated search parameter.
 *
 * An empty array — which `?next=` with nothing after it can produce — reads as
 * **absent**, not as `""`: the visitor supplied no value, and `""` is a value.
 * `noUncheckedIndexedAccess` makes `value[0]` honest about that.
 */
export function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
