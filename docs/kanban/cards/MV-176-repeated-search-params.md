# MV-176 — a repeated query parameter 500s the sign-in page

**Priority:** P1   **Owner:** agent
**Goal:** Stop `/auth?next=/a&next=/b` returning a server error. A visitor who reaches the sign-in page by a mis-built or hand-edited link must still be able to sign in — and the two pages that declare `searchParams` should describe the URLs a visitor can actually type.

**Found:** while reviewing MV-170 (PR #136), in code outside that slice. MV-170's own self-review fixed this exact shape on its new page and recorded the two remaining instances as *"noted, not changed, because it is not this slice's code"*. This card is that follow-through.

**Live in production.** Both pages are on `master`, and `master` is what Vercel serves.

## The defect

Next hands a **repeated** query parameter through as `string[]`. This is the framework's own contract, not an edge case someone imagined — `next/dist/server/request/search-params.d.ts:2`:

```ts
export type SearchParams = { [key: string]: string | string[] | undefined };
```

`app/(marketing)/auth/page.tsx` declared `searchParams: Promise<{ next?: string; assessment?: string }>`. That is a claim about the URL, not about Next, and TypeScript cannot check it — the value crosses the framework boundary untyped. So:

| URL | What happened |
|---|---|
| `/auth?next=/a&next=/b` | `safeNext(["/a","/b"])` → `input.startsWith` is not a function → **500 on the sign-in page** |
| `/auth?next=` (empty, repeated) | `[]` is truthy, so `!input` is false → same `TypeError` → **500** |
| `/auth?next=/a&next=/b` (signed out) | the array reached `<AuthCard nextPath={…} />`, a prop typed `string` |
| `/auth?assessment=<id>&assessment=<id>` | `String([a,b])` is `"a,b"`, which fails the id shape check → the claim was **silently not signed**, so a visitor arriving from their anonymous results lost the assessment the token binds |

`lib/auth/safe-next.ts:3` is the throw site (`input.startsWith("/")`), `app/(marketing)/auth/page.tsx:36` the call site.

**This is a crash, not a security hole**, and the distinction decided the fix. `safeNext` returning `null` is already the safe path, and the throw happens *before* `redirect` is reached — no unsafe destination was ever followed. The redirect-safety logic is correct and is **not** restructured here.

`app/(focused)/assess/page.tsx` declared `searchParams` the same way. It calls no string method on either value — `first(sp.new) === "1"` is a comparison and `isClaimErrorCode` is a `typeof` + `includes` — so a repeated parameter never crashed it. It was **silently ignored** instead: an array is neither `"1"` nor a known error code.

## Scope

### In
- `lib/http/search-params.ts` — `SearchParamValue` and `first()`. One shared home, not a third private copy.
- `app/(marketing)/auth/page.tsx` — truthful `searchParams` type; `next` and `assessment` collapsed at the boundary.
- `app/(focused)/assess/page.tsx` — same, for `new` and `error`.

### Explicitly out
- **Any change to `lib/auth/safe-next.ts`.** Its rejections are correct; the caller was handing it the wrong type. Widening `safeNext` to accept `string[]` would move a URL-shape concern into a redirect-safety guard, where a later reader would have to re-derive why an array is there.
- **The MV-170 students page.** It ships its own `first()` and is *not on `master`* — it lives on the open PR #136. See "The third copy", below.
- Every other `searchParams` declaration in `app/`. There are none: these two are the complete set on `master` (`git grep searchParams -- 'app/**/*.tsx'`).

## The third copy — deliberately not in this diff

The brief asked for one shared helper *"so the pattern has one home before a fourth page needs it"*, and for MV-170's students page to use it too. **That page does not exist on `master`.** It arrives with PR #136, which is open and founder-gated.

Editing a file this branch does not contain would mean either branching off #136 (stacking this fix behind a review it does not depend on) or reintroducing the file wholesale. Neither is honest. So:

- The helper lands here, on `master`'s two pages, where the crash is.
- MV-170's private `first()` (`app/(app)/workspace/[organizationId]/students/page.tsx:42-44`) is **behaviourally identical** — `Array.isArray(value) ? value[0] : value`, the same expression — so nothing is wrong while both exist.
- **Whichever of #136 / this PR merges second swaps that private copy for the import.** It is a same-behaviour one-line change plus a deleted three-line function; no test of MV-170's changes.

Recorded here rather than left to be noticed, because "one home" is the point of the card and a silent second copy would retire it.

## Acceptance criteria

- [x] `/auth?next=/a&next=/b` redirects a signed-in visitor to `/a` instead of throwing.
- [x] The same URL renders the sign-in card for a signed-out visitor instead of throwing.
- [x] `AuthCard` receives a `string`, never an array, in its `nextPath` prop.
- [x] An empty array (`?next=` with no value) reads as **absent** — fall back to `/dashboard`, and pass nothing to `AuthCard` — not as `""`.
- [x] `safeNext`'s existing rejections still reject when the hostile value arrives **first** in an array: `//evil.com`, `/\evil`, `https://evil.com/path`.
- [x] A safe *later* value does not rescue a hostile first one — the first value is the whole answer.
- [x] A repeated `?assessment=` signs a claim for the first id, and signs nothing when the first id is not an assessment id.
- [x] `/assess` honours the first `?new=` and `?error=` value rather than ignoring a repeated one.
- [x] Both pages' declared `searchParams` types match Next's `SearchParams` contract.
- [x] `lib/auth/safe-next.ts` is unchanged, and `tests/auth/safe-next.test.ts` stays green without edits.

## Test plan

- `tests/http/search-params.test.ts` — `first()` alone: single value through untouched, absent, two entries, three entries, and the empty array reading as absent.
- `tests/app/repeated-search-params.test.tsx` — both pages driven the way a URL drives them, with arrays.

**The red test came first, and it failed for the right reason.** Against the pre-fix page:

```
FAIL tests/app/repeated-search-params.test.tsx > /auth with a repeated ?next=
  > redirects a signed-in visitor to the first path instead of throwing
AssertionError: expected [Function] to throw error including 'REDIRECT'
  but got 'input.startsWith is not a function'
```

That is the production failure, reproduced in the suite. A test that merely asserted the fixed behaviour would have proved nothing about the bug.

## Integration gate

```
npm run typecheck && npm run lint && npm test
```

## Dependencies / blocked-by

- **None.** Branches off `origin/master` @ `6a40b4d` and touches no file MV-170 or any other open PR touches.
- **Not blocked by PR #136**, and #136 is not blocked by this. They are disjoint diffs; only the follow-up swap described above connects them, and it belongs to whichever merges second.

## Risk notes

- **The `/assess` behaviour delta is real, and it is the one judgment call in this card.** Before: a repeated `?new=`/`?error=` was silently ignored. After: the first value is honoured. Nobody designed the old behaviour — it fell out of comparing an array to a string — but it *is* a change on a page that was not crashing. Flagged for the founder in the PR body rather than buried. Applying the same collapse on both pages is what makes the pattern one pattern; a second, quieter convention on the sibling page would be the more expensive choice.
- **The type change cannot be validated by TypeScript at the boundary.** `searchParams` is a framework input; declaring it `string` compiled fine for as long as the bug existed. What now holds the line is the test file, which passes arrays at runtime — a type-only fix would have been indistinguishable from the original bug.
- **`first()` is not a validator and must not grow into one.** It answers "which value", not "is this value acceptable". `safeNext` and `claimFor` still decide acceptability, unchanged.

## Agent resume notes (for a cold start)

Branch `mv-176-repeated-search-params` off `origin/master`. No worktree carries a populated `node_modules` — install into a non-OneDrive directory (`C:\ci\mv176`) and junction it in; see `[[sibling-worktree-dev-server]]`, and **delete the junction before any `git worktree remove --force`** (it follows the junction and empties the target install). Run the gate **unpiped** — piping through `tail` reports `tail`'s exit code. Regenerate the board with `node docs/kanban/build.mjs` (not `npm run board`, which needs `node_modules`). **Open a PR; do not merge — `master` is production and the merge is founder-gated.**

## Decision log

- **2026-08-10 — the helper lives in `lib/http/search-params.ts`, not in `lib/auth/`.** The concern is "how a URL reaches a Next page", which is shared by `/assess` (nothing to do with auth) and by MV-170's workspace list. Filing it under `auth/` would have made the third caller import from a directory it has no business in.
- **2026-08-10 — `safeNext` was left alone.** It could have been widened to accept `string | string[] | null | undefined`, which would also have stopped the crash. Rejected: the bug is that the page lied about its input, and fixing it inside the redirect guard would leave the lie in place and put URL-shape handling inside a security check, where every future reader has to decide whether the array branch is load-bearing. Its test file is untouched and still green — evidence the guard's contract did not move.
- **2026-08-10 — an empty array reads as absent, not as `""`.** `?next=` with nothing after it is a visitor who supplied no destination; `""` is a value they did not supply, and it would flow into `AuthCard`'s `nextPath ?? "/dashboard"` as a *present* empty string. `noUncheckedIndexedAccess` (already on) types `value[0]` as `string | undefined`, so the honest reading is also the one the compiler already believed.
- **2026-08-10 — the first value wins; there is no "pick the safe one" fallback.** `?next=//evil.com&next=/profile` redirects to `/dashboard`, not `/profile`. Scanning an array for the first value that passes `safeNext` would let an attacker append a plausible-looking second parameter to steer a URL that the guard had already rejected. One value in, one decision.
- **2026-08-10 — `/assess` got the same collapse rather than a behaviour-preserving type cast.** The alternative (`typeof sp.error === "string" ? sp.error : undefined`) preserves today's exact behaviour but enshrines "a repeated parameter is ignored" as an intention, which nobody held. See the risk note; the founder can reverse this in review without touching the crash fix.

## Done evidence

**Branch** `mv-176-repeated-search-params` off `origin/master` @ `6a40b4d`.

### Integration gate — 2026-08-10

| Command | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** |
| `npm test` | **exit 0 — 342/342 files, 2769/2769 tests** |
| `npm run build` (CI's placeholder Supabase env) | **exit 0** |

Exit codes were read from an **unpiped** run — each command redirected to a file and `$?`
echoed. Piping the gate through `tail` reports `tail`'s exit status, which is how a red gate
reads as green.

**+21 tests** (2748 → 2769), and the arithmetic is the cross-check rather than the claim:
4 in `tests/http/search-params.test.ts` + 17 in `tests/app/repeated-search-params.test.tsx` = 21,
and 2769 − 21 = 2748 — exactly the master figure MV-170 recorded as its own baseline.

`npm run build` was run although the stated gate is the three commands: this change alters two
pages' props types, which Next validates against its generated route types at build time and
nowhere else.

### Mutation tests — every guard was removed and the suite watched to go red

A test that only asserts the fixed behaviour passes identically against a **missing** fix, so each
piece of the fix was deleted, the suite re-run, and the piece restored.

| Mutation | Result |
|---|---|
| `first()` stops collapsing arrays (returns the array) | **RED** — 13 of 21 failed |
| `first()` drops the `Array.isArray` guard (`value?.[0]`, so strings get indexed too) | **RED** — 1 failed |
| `first()` returns `""` for an empty array instead of `undefined` | **RED** — 2 failed |
| `/auth` stops collapsing `?next=` — **the original defect, restored** | **RED** — 8 failed |
| `/auth` stops collapsing `?assessment=` | **RED** — 1 failed |
| `/assess` stops collapsing `?new=` and `?error=` | **RED** — 2 failed |

All restored; `git status --porcelain` clean afterwards, no mutation edit survived into a commit.

### What these tests do not prove

They are jsdom tests calling the page functions directly, so they prove what each page *does with*
a `string[]` — not that Next produces one. That half rests on Next's own published type
(`SearchParams`, quoted above), read out of the installed package rather than from memory. No dev
server was run: this change has no rendered output to look at, and the `jsdom is blind to layout`
lesson is about CSS and timing, neither of which is in this diff.
