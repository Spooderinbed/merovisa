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
 * A URL reaches this type three ways and only three: a parameter that appears
 * zero times is `undefined`, once is a `string`, and twice or more is a
 * `string[]` with that many entries. `?next=` with nothing after it is the
 * *once* case — it arrives as `""`, not as `[]` — and `""` passes through
 * unchanged, because the visitor did supply a value and an empty one is still a
 * value. Whether it is an acceptable one is `safeNext`'s question, not this
 * function's.
 *
 * `[]` is therefore unreachable from a URL, but it inhabits the type and a
 * non-URL caller can build one, so `value[0]` reads as **absent** — the only
 * honest answer to "which value" when there is none. `noUncheckedIndexedAccess`
 * already types it that way, so saying so costs no branch.
 */
export function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
