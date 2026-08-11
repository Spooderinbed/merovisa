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
- **Widening `safeNext` to accept `string[]`.** The caller was handing it the wrong type. Accepting an array inside the guard would move a URL-shape concern into a redirect-safety check, where a later reader would have to re-derive why an array is there. Still out after review round 1.
- ~~**Any change to `lib/auth/safe-next.ts`.** Its rejections are correct.~~ **Superseded by review round 1 (F1).** The original scope rested on "its rejections are correct". Review found one that was not — a whitespace open redirect that the three prefix checks are exactly shaped to miss — so the file is in scope, for that bypass only.
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
- [x] An empty array reads as **absent** — fall back to `/dashboard`, and pass nothing to `AuthCard` — not as `""`. (The original wording said `?next=` with no value *is* this shape. It is not; see F2 in review round 1.)
- [x] `safeNext`'s existing rejections still reject when the hostile value arrives **first** in an array: `//evil.com`, `/\evil`, `https://evil.com/path`.
- [x] A safe *later* value does not rescue a hostile first one — the first value is the whole answer.
- [x] A repeated `?assessment=` signs a claim for the first id, and signs nothing when the first id is not an assessment id.
- [x] `/assess` honours the first `?new=` and `?error=` value rather than ignoring a repeated one.
- [x] Both pages' declared `searchParams` types match Next's `SearchParams` contract.
- [x] ~~`lib/auth/safe-next.ts` is unchanged, and `tests/auth/safe-next.test.ts` stays green without edits.~~ **Retired by review round 1 (F1).** The guard is changed, deliberately. The load-bearing half survives: all five original assertions still pass without edits, so the contract that existed did not move — it was extended.

### Added by review round 1 (PR #137)

- [x] **F1** — `safeNext` rejects any value containing ASCII whitespace or a C0/C1 control character. `%09`, `%0a`, `%0d`, a literal space, NUL, DEL and a C1 character are each covered, and each test failed against the pre-fix guard.
- [x] **F1** — rejection, never sanitisation: no input is stripped and re-approved.
- [x] **F1** — the caller's half: `/auth?next=/%09/evil.com` redirects a signed-in visitor to `/dashboard`, not to the hostile value and not to a 500.
- [x] **F1** — a clean `?next=` still reaches where it asked (`/matches`, `/`, a fragment, a query, a percent-encoded path).
- [x] **F2** — `lib/http/search-params.ts` documents the shapes a URL can actually produce, and the empty-string case it does produce is stated and pinned.

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
- **2026-08-10 — an empty array reads as absent, not as `""`.** `[]` carries no value at all, so `value[0]` is `undefined` and that is the only honest answer to "which value". `noUncheckedIndexedAccess` (already on) types it that way, so the honest reading is the one the compiler already believed.
  - **Corrected 2026-08-11 (F2).** The original entry justified this with *"`?next=` with nothing after it is a visitor who supplied no destination"*. That premise is false. `?next=` produces `""` — one empty string — and `[]` is unreachable from any URL. The conclusion still holds for the shape it is actually about; the reasoning has been rewritten in `lib/http/search-params.ts` to describe the mapping a URL really has, and pinned by a test that measures it rather than asserting it.

### Review round 1 — 2026-08-11 (PR #137)

- **F1 — the guard was reopened, and the original "safe-next is out of scope" line retired.** MV-176's premise was that this is a crash, not a security hole, and that `safeNext`'s rejections were correct. The first half is still true of *this card's* defect. The second half was not: `?next=/%09/evil.com` reaches `safeNext` as `/<tab>/evil.com`, which starts with `/`, does not start with `//` or `/\`, and is returned unchanged. Next's relative `redirect()` puts it on the `Location` header verbatim; the browser strips the tab before resolving and lands on `//evil.com` — protocol-relative, off-origin. The three prefix checks are precisely the shapes it slips between. Fixing it here rather than filing it forward: the file is already open in this diff's review, and an open redirect on the sign-in path is not something to carry.
- **F1 — reject, never strip.** Stripping the tab would turn `/<tab>/evil.com` into `//evil.com`, which then has to be re-proved by the very checks that just failed to see it. A sanitised value is a value you then have to re-prove, so the guard refuses and the caller's `?? "/dashboard"` takes over.
- **F1 — two layers, and only one is currently load-bearing. Kept anyway, with the measurement.** Layer 1 is an explicit code-point check (U+0000–U+0020, U+007F–U+009F). Layer 2 resolves the value against a placeholder origin and requires that resolving changed nothing — an allowlist, in the sense that it approves only strings the URL parser leaves alone. **Mutation testing shows layer 2 subsumes layer 1 today**: deleting layer 1 entirely, or narrowing it to just tab/LF/CR, leaves the suite green. No input exists that layer 1 catches and layer 2 does not, because the URL parser percent-encodes every character in those ranges (or strips it, which changes the origin). Layer 1 stays for two reasons. It is the only place the code *names* the vulnerability class, so the reason tabs matter does not live solely in a comment. And layer 2 is the check a future maintainer is most likely to weaken — it rejects legitimate-looking values like `/a/../b` and `/café` — at which point layer 1 is what keeps the bypass shut. Recorded rather than left for the next reviewer to rediscover as apparent dead code.
- **F1 — the round-trip narrows two shapes that used to pass, deliberately.** `/a/../b` (parser-normalised to `/b`) and `/café` (parser-encoded to `/caf%C3%A9`) are now refused. Both fall back to `/dashboard`, so nothing breaks; neither is a shape this app produces, because `x-pathname` comes from `request.nextUrl.pathname`, which is already normalised and percent-encoded. The principle is that a value the parser rewrites is a value the guard and the browser read differently — which is the entire shape of this bug — so it is refused rather than repaired.
- **F2 — the doc was wrong about the URL, not the code; the code stands.** The comment claimed `?next=` with nothing after it produces `[]`. It produces `""`. The finding offered deleting the rule as unreachable, or applying it to `""`. Neither: (a) `[]` is unreachable *from a URL* but inhabits `SearchParamValue`, a non-URL caller can build one, and `value[0]` returning `undefined` is not a branch that could be deleted — `noUncheckedIndexedAccess` types the result that way regardless. (b) Collapsing `""` to absent would make `first` a normaliser, contradicting this card's own line that *"`first()` is not a validator and must not grow into one"* — `""` is a value the visitor supplied, and `safeNext` already refuses it a moment later. So the doc now states the real three-way mapping, and a test measures that mapping off `URLSearchParams` so the false claim cannot creep back.
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

### The premise, measured against live production

The tests are jsdom tests calling the page functions directly, so they prove what each page *does
with* a `string[]` — not that Next produces one. That half was measured on **live production**
(`https://merovisa.vercel.app`, i.e. `master`, pre-fix), anonymously, with the control run first:

| URL | Rendered |
|---|---|
| `/assess?error=expired` | **"This assessment has expired"** — the recovery surface |
| `/assess?error=expired&error=auth` | **the normal 9-step wizard** — the parameter was silently dropped |

The control is what makes it evidence rather than a coincidence: the single-value form proves the
query string reaches the page at all, so the repeated form rendering something *different* can only
be the array. Next hands `string[]` through on a real deployment, exactly as its type says.

The post-fix half of that A/B could **not** be run: the Vercel preview for this PR sits behind
Vercel Authentication, and signing into it is not something an agent should do. The crash itself is
likewise not anonymously reproducible — `safeNext` is only reached inside the `if (data.user)`
branch, so demonstrating the 500 needs a signed-in session.

No dev server was run: this change has no rendered output to look at, and the `jsdom is blind to
layout` lesson is about CSS and timing, neither of which is in this diff.

## Review round 1 evidence — 2026-08-11

Two findings from the review of PR #137: **F1** (medium, security) a whitespace open redirect in
`lib/auth/safe-next.ts`; **F2** (low) a doc/code disagreement in `lib/http/search-params.ts`.

### F1 — the red test came first, and failed for the right reason

```
 Test Files  2 failed (2)
      Tests  16 failed | 24 passed (40)

 × rejects a path whose tab (%09) hides a protocol-relative URL
 × rejects a path whose line feed (%0a) hides a protocol-relative URL
 × rejects a path whose carriage return (%0d) hides a protocol-relative URL
 × rejects a path whose a literal space hides a protocol-relative URL
 × rejects a path whose a NUL hides a protocol-relative URL
 × rejects a path whose a C0 control hides a protocol-relative URL
 × rejects a path whose a DEL hides a protocol-relative URL
 × rejects a path whose a C1 control hides a protocol-relative URL
 × rejects whitespace and controls anywhere in the value, not only after the slash
 × rejects values the URL parser rewrites
 × still rejects a tab-hidden protocol-relative first element and falls back to /dashboard
 × redirects a signed-in visitor to /dashboard for %09 (tab)
 × redirects a signed-in visitor to /dashboard for %0a (line feed)
 × redirects a signed-in visitor to /dashboard for %0d (carriage return)
 × redirects a signed-in visitor to /dashboard for a literal space
 × redirects a signed-in visitor to /dashboard for a C1 control

AssertionError: expected '/\t/evil.com' to be null
AssertionError: expected "vi.fn()" to be called with arguments: [ '/dashboard' ]   (x6)
```

The two failure messages are the two halves of the finding: the guard **returned the hostile value**,
and the caller **redirected to it**. The 24 that passed are the pre-existing assertions — the old
contract did not move.

### Integration gate — 2026-08-11, re-run after the fix

| Command | Result |
|---|---|
| `npm run typecheck` | **exit 0** (`tsc --noEmit`, no output) |
| `npm run lint` | **exit 0** (`eslint`, no output) |
| `npm test` | **exit 0 — 342/342 files, 2789/2789 tests** |

Exit codes read from unpiped runs, each redirected to a file with `$?` echoed.

**+20 tests** (2769 → 2789), and the arithmetic is the cross-check: 11 in `tests/auth/safe-next.test.ts`
(8 in the hostile-character table, plus controls-anywhere, parser-rewrites, and the accept case)
+ 7 in `tests/app/repeated-search-params.test.tsx` (1 added to the existing hostile-first-element
table, plus a 6-test block for the single-value form the bypass actually uses)
+ 2 in `tests/http/search-params.test.ts` — 11 + 7 + 2 = 20, and 2789 − 20 = 2769, the figure this
card recorded on 2026-08-10.

### F1 — mutation matrix, and the one result worth reading twice

Each guard was removed in turn and the two affected files re-run.

| Mutation | Result |
|---|---|
| **A** — delete the control/whitespace check entirely | **green (40/40)** |
| **B** — delete the origin check | **green (40/40)** |
| **C** — delete the round-trip equality check | **RED** — 1 failed (`expected '/a/../b' to be null`) |
| **D** — delete both the origin and round-trip checks | **RED** — 1 failed, same assertion |
| **E** — narrow the character check to tab/LF/CR only, dropping space/DEL/C1 | **green (40/40)** |

**A and E staying green is the honest headline, and it is not a vacuous-test result.** Every one of
those 16 tests was red against the committed guard, so they test something real. What A and E show is
that the two layers overlap: with layer 1 deleted, layer 2 still closes the bypass, and vice versa
(C and D leave every control-character test green). That is the property defence-in-depth is supposed
to have, and it is the reason layer 1 is kept despite no test being able to distinguish it — see the
decision log. `git status --porcelain` was clean after restoring; no mutation reached a commit.

### F1 — adversarial pass: four independent lenses tried to break the fixed guard

A green suite proves the cases I thought of. Four agents were pointed at the fixed guard with
distinct attack lenses and told to default to "no bypass" unless they could demonstrate one
empirically. All four ran; **zero bypasses**.

| Lens | What it attacked | Result |
|---|---|---|
| whitespace / controls | characters a browser strips, trims or normalises — tab, LF, CR, C0/C1, NBSP, U+2028/2029, BOM, zero-width, fullwidth solidus, NFKC/IDNA folds | 35 candidates, none survived *and* resolved off-origin |
| scheme / authority | `//`, `///`, `/\`, `/%2f%2f`, `/%5c`, `/.//`, `/..//`, `/https://`, userinfo `/@evil.com`, port, fragment and query smuggling | ~40 candidates + a 5,000,000-iteration fuzz: 978,654 survivors, **0** off-origin |
| parser disagreement | places where the round-trip can hold while a browser still resolves elsewhere: lone surrogates, overlong percent-encodings, opaque origins, non-special schemes | ~60 candidates; pathname+search+hash byte-identical under the placeholder base and the live base in every probe |
| caller / header | the path from `safeNext` to the wire — all 12 call sites, re-encoding, concatenation, OAuth `redirectTo`, CRLF header splitting | 871,530 probes, 25,760 survivors, **0** off-origin |

**The negative result is evidence rather than blindness, because the rig had positive controls.**
The caller lens stood up a live two-origin HTTP server and drove real Chrome through top-level
navigations: the three values the guard *rejects* (`//host`, `/\host`, `/<tab>//host`) each **did**
navigate Chrome to the attacker origin, so the harness demonstrably detects a real escape. The 13
guard-approved payloads carrying an attacker authority all landed on the site origin.

The structural argument the lenses converged on, independently: after the prefix checks, any value
reaching the round-trip starts with exactly one `/` whose next character is neither `/` nor `\`, so
WHATWG parses it as a path-absolute reference whose reconstruction is base-independent. Requiring
`pathname + search + hash === input` therefore forces the browser to produce exactly
`origin + input`, which is on-origin by construction.

**Two observations surfaced that are not `safeNext` bypasses and are not fixed here:**

1. `lib/auth/site-origin.ts:14` trusts `x-forwarded-host` / `host` when `NEXT_PUBLIC_SITE_URL` is
   unset, which controls the *origin* half of `app/auth/callback/route.ts:36` independently of this
   guard. Not victim-triggerable — a browser cannot be induced to send a forged `x-forwarded-host`
   cross-origin — and Vercel overwrites the header. Latent, not exploitable, and out of this card's
   scope; flagged rather than folded in.
2. `app/(marketing)/auth/page.tsx:47` passes the **raw** `next` to `AuthCard`, which builds the OAuth
   `redirectTo`. Verified safe: `URLSearchParams` contains all 17 hostile values tested, the
   `redirectTo` origin and `/auth/callback` path never move, and the callback re-guards on read-back.
   Left as it is — but that encoding is load-bearing, which is now written down.

### F2 — no red test, and that is the honest report

F2 is a documentation correction: the comment described a shape (`[]` from `?next=`) that a URL cannot
produce. No behaviour changed, so there was no failing test to write, and manufacturing one for a
comment would be theatre. What was added instead is a test that **measures** the claim the corrected
doc now makes — the five query strings and the three shapes `URLSearchParams` maps them onto — so the
false claim cannot return unnoticed, plus a named test pinning that `?next=`'s `""` stays a value.
Both pass before and after; they are there to hold the doc to account, not to prove a fix.
