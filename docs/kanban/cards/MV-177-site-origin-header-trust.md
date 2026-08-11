# MV-177 — The redirect origin is taken from a request header on trust

**Priority:** P2   **Owner:** agent
**Goal:** A student's post-sign-in redirect lands on this site's origin because of what the
deployment is *configured* to be, not because of what a request *claimed* it was — and a
malformed proxy header degrades to the app's own origin instead of a 500 on the sign-in page.

## Context links

- Surfaced by the adversarial pass over `lib/auth/safe-next.ts` during the review of
  **PR #137 / MV-176**, recorded there as observation 1 (`docs/kanban/cards/MV-176-repeated-search-params.md`,
  "Two observations surfaced that are not `safeNext` bypasses and are not fixed here").
  This is **not** a `safeNext` bypass — that guard was independently confirmed sound.
- Independently flagged by the 2026-07-10 comprehensive audit:
  `docs/audits/2026-07-10-comprehensive/claude/sections/technical-audit.md:69` — "`.env.example`
  omits three code-referenced vars … A fresh deploy silently omitting `NEXT_PUBLIC_SITE_URL`
  makes `resolveSiteOrigin` fall back to host headers for the post-auth redirect target".
- Code: `lib/auth/site-origin.ts` · callers `app/auth/callback/route.ts:36`
  (`${origin}${destination}`) and `app/api/auth/email/start/route.ts:45` (`emailRedirectTo`).
- Operator doc: `docs/email-auth-setup.md` §3 already instructs "Confirm `NEXT_PUBLIC_SITE_URL`
  is set in Vercel" — but `.env.example` never lists it, so nothing enforces or even mentions it
  at deploy time.

## The observation

`resolveSiteOrigin` resolves in this order:

| # | Branch | Fires when |
|---|---|---|
| 1 | `url.origin` | `NODE_ENV === "development"` — **local dev is handled here** |
| 2 | `NEXT_PUBLIC_SITE_URL` | the var is set |
| 3 | **`x-forwarded-host` / `host` header** | the var is unset — *the branch in question* |
| 4 | `url.origin` | no host header at all |

Branch 3 controls the **origin** half of `${origin}${destination}`, independently of `safeNext`,
which only ever validates the **destination** half. It is the only place in the redirect where
the host comes from request data rather than configuration.

## Evidence gathered before deciding

**The fallback is load-bearing — it is not dead code.** Local dev never reaches it (branch 1
catches `NODE_ENV=development` first), so the deployment shape it actually serves is a
**Vercel preview**: every PR gets its own `*.vercel.app` URL, and a single fixed
`NEXT_PUBLIC_SITE_URL` in Vercel's Preview environment would be wrong for all of them.
`VERCEL_URL` cannot replace it — that is the deployment-hash URL, which is SSO-gated and is not
the alias a user is on. `tests/api/auth-callback.test.ts:145` also pins the behaviour. Removing
the fallback outright was rejected on this evidence.

**Measured against live production, 2026-08-11** (read-only `GET`s, no side effects):

| Probe | Result | What it establishes |
|---|---|---|
| `x-forwarded-host: attacker.example` → `merovisa.vercel.app/auth/callback` | `307 Location: https://merovisa.vercel.app/assess` | **Vercel does overwrite the header at the edge.** The "latent, not live" claim is measured, not assumed. |
| `Host: attacker.example` → same | `404` | Vercel routes by `Host`; an unknown one never reaches the deployment. |
| `merovisa-fy106q2hu-…vercel.app/auth/callback` (production deployment-hash URL, from the GitHub deployment status for `6a40b4d`) | `302 → vercel.com/sso-api` | **Whether `NEXT_PUBLIC_SITE_URL` is actually set in Vercel is not determinable from outside** — the only URL that would distinguish branch 2 from branch 3 is SSO-gated. |
| `merovisa.app` | no DNS | Production is `merovisa.vercel.app`; the custom domain is not live. |

So the practical risk today is exactly what PR #137 recorded: a deployment where
`NEXT_PUBLIC_SITE_URL` is unset **and** the proxy in front passes the header through. Not
Vercel. But `.env.example` omits the var, so a fresh deploy starts in branch 3 by default.

**A second, distinct defect in the same branch.** Branch 3 interpolates both header values into
a string and hands the result to `NextResponse.redirect`, which parses it. Nothing bounds what
they contain:

- `x-forwarded-host: site@evil.com` → `https://site@evil.com/dashboard` — the authority is
  `evil.com`; the userinfo makes it read as the site.
- `x-forwarded-host: real.host, other.host` (the comma-joined form a **chain of proxies**
  produces) → `https://real.host, other.host/dashboard` → unparseable → **`NextResponse.redirect`
  throws → 500 on the sign-in page.** That is the same failure class MV-176 has just finished
  fixing, reached through the header rather than the query string.
- `x-forwarded-proto: javascript` → `javascript://host/dashboard`.

## Decision

Neither "fail closed" nor "leave it documented". Both were considered against the evidence:

- **Fail closed (require `NEXT_PUBLIC_SITE_URL` in production).** Rejected. It converts a
  latent, unexploitable-on-Vercel security risk into a live availability risk — a missing env
  var would mean no student can sign in at all — and it breaks Vercel previews, which have no
  correct fixed value to require.
- **Leave it, documented.** Rejected, though defensible. The measurements support "not
  exploitable *on Vercel today*", but the code offers no structural bound on what it will emit
  as an origin, and `.env.example` still steers a fresh deploy into the untrusted branch.
- **Chosen: bound the trust, don't remove the branch.** Two changes, neither requiring any new
  configuration and neither able to break a correctly-configured Vercel deploy:
  1. **Scope the trust to a trusted edge.** Consult the header only when the runtime is Vercel
     (`VERCEL` / `VERCEL_ENV` system env vars) — the one environment where the edge-overwrite is
     *measured* above. Off Vercel the header is ignored and resolution falls through to
     `url.origin`, the branch-4 last resort that already exists.
  2. **Validate the result structurally**, in the round-trip idiom MV-176 settled on rather than
     a denylist: build the candidate, parse it, and accept it only if the parse is *exactly an
     origin* — `http:`/`https:` scheme, no credentials, no path, no query, no fragment — then
     return `URL.origin`, the parser's own normalization. Anything else falls through.

Every new rejection degrades to `url.origin`. No new path can 500, and no path can emit an
origin the parser did not certify.

## Acceptance criteria

- [ ] With `VERCEL` unset and `NEXT_PUBLIC_SITE_URL` unset, a forged `x-forwarded-host` does
      **not** appear in the redirect `Location`; the app's own origin is used.
- [ ] With `VERCEL=1`, the forwarded host is still honoured — Vercel previews keep working and
      the existing production behaviour is unchanged.
- [ ] `NEXT_PUBLIC_SITE_URL` still outranks every header, on Vercel and off it.
- [ ] `NODE_ENV=development` still short-circuits to `url.origin`.
- [ ] A host carrying userinfo (`site@evil.com`) is rejected, not emitted.
- [ ] A comma-joined proxy-chain host (`a.host, b.host`) does not throw — it falls through.
- [ ] A non-http(s) `x-forwarded-proto` (`javascript`) is rejected.
- [ ] A host with a path/query/fragment appended is rejected.
- [ ] A legitimate host carrying an explicit port survives.
- [ ] `.env.example` documents `NEXT_PUBLIC_SITE_URL` and says what an unset value costs.

## Test plan

- New unit suite `tests/auth/site-origin.test.ts` covering the precedence table and every
  rejection above, directly against `resolveSiteOrigin` — the level the logic actually lives at.
- `tests/api/auth-callback.test.ts:145` (the existing "prefers the public x-forwarded-host"
  route test) keeps its intent but must now declare it is on Vercel; a mirror case asserts the
  off-Vercel behaviour end-to-end through the route, so the guarantee is pinned where the
  concatenation happens and not only in the unit.
- The red step is the off-Vercel forgery case: it fails against the current implementation.

## Integration gate

```
npm run typecheck && npm run lint && npm test
```

## Dependencies / blocked-by

- None. Independent of PR #137 (MV-176) — this branches off `origin/master`, which does not
  contain it. No overlapping files.

## Risk notes

- **Deployment risk, and it is real.** If Vercel's *"Automatically expose System Environment
  Variables"* project setting is off, `VERCEL` is undefined at runtime and branch 3 stops
  firing. If `NEXT_PUBLIC_SITE_URL` is also unset, sign-in redirects would fall to `url.origin`
  — the internal host — which is exactly the outage the file's header comment exists to prevent.
  Both would have to be true at once, and branch 2 short-circuits the whole question. **Founder
  pre-merge check: confirm `NEXT_PUBLIC_SITE_URL` is set in Vercel → Production.** It cannot be
  verified from outside (the deployment-hash URL is SSO-gated, measured above) and
  `docs/email-auth-setup.md` §3 already asks for it.
- No scoring, RLS, migration, or data-model surface is touched.

## Agent resume notes (for a cold start)

Branch `mv-177-site-origin-header-trust` off `origin/master`. The whole change is
`lib/auth/site-origin.ts` (~30 lines), one new test file, one existing test file, and
`.env.example`. Start by running `npm test tests/auth/site-origin.test.ts` — if it is red on the
off-Vercel forgery case, the red step is intact and only the implementation is missing.

## Decision log

- **2026-08-11** — Probed live production before deciding: Vercel's edge overwrite is real
  (forged `x-forwarded-host` did not move the `Location`), and the config state is unknowable
  from outside (deployment-hash URL is SSO-gated). Recorded both above.
- **2026-08-11** — Confirmed the fallback is *not* dead: `NODE_ENV=development` already handles
  local dev, so the branch exists for Vercel previews. Rejected removal.
- **2026-08-11** — Found a second defect in the same branch while reading it: a comma-joined
  `x-forwarded-host` from a proxy chain makes `NextResponse.redirect` throw, 500ing sign-in.
  Folded in — same function, same test file, and it is what makes the guard fail *safe*.

## Done evidence

- (filled on completion)
