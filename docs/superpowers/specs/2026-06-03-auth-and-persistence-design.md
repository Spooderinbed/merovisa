# MyVisa — Plan 3: Auth & Persistence Design Spec

**Date:** 2026-06-03
**Scope:** Make the three-tier conversion real — Google accounts, server-side assessment persistence, claim-on-signup, owner-only retrieval. Builds on Plans 1 (domain/scoring) and 2 (wizard + results UI).
**Status:** Design approved; schema validated live against the Merovisa Supabase project.

---

## 1. Goal

Turn the placeholder conversion flow from Plan 2 into a working auth + persistence layer: a completed assessment is persisted, a student creates an account with Google, their assessment is claimed to them and re-openable, and signing in unlocks the full results.

## 2. Scope

**In scope:**
- Supabase Auth via **Google OAuth** — the only account method.
- Server-side persistence of assessments (anonymous row → claimed on signup).
- `assessments` + `leads` tables with deny-by-default RLS.
- Wiring the three-tier conversion: Tier 1 (Google account), Tier 2 (email lead capture, no send), Tier 3 (come back later).
- Signed-in **unlock**: full university matches revealed; deep teasers become an honest "coming soon."
- Owner-only re-open at `/assessment/[id]`.
- 3-day expiry on unclaimed assessments (drives signup urgency).
- Version-controlled Supabase migration + generated DB types.

**Deferred to Plan 4 (Production hardening):**
- Upstash rate limiting on public endpoints.
- Monitoring: Sentry, PostHog, BetterStack.
- Transactional email (actually *sending* Tier-2 results email via a provider).
- Vercel production deploy + per-environment Supabase projects.
- Scheduled cleanup (cron) of expired unclaimed assessments.
- Email magic-link login (schema/UI left open for it, but not built).

**Explicitly not in this product yet:** dashboards, profile hub, document upload, scholarships/procedure/document guide content (these remain post-MVP "coming soon").

## 3. Key Decisions (from brainstorming)

1. **Accounts = Google OAuth only.** No email/password, no email magic-link in Plan 3. "No password to leak" (per MVP design spec §security).
2. **Persistence model = anonymous row + claim on signup (Approach A).** All writes are server-side via the service-role client. RLS reduces to a single owner-only SELECT policy.
3. **Stored data = profile + result snapshot + rule_version.** Re-opening shows the snapshot the student originally saw; re-run with newer rules is a future action (honors the spec's versioning intent).
4. **Tier 2 email = lead capture only.** Store the email + assessment reference + consent; the actual outbound email is Plan 4.
5. **Unlock reveals real content only.** Full university matches (data exists); deep guides become "coming soon — we'll notify you." Trust-first: never fake-unlock content that doesn't exist.
6. **Supabase work goes through the Supabase plugin/skill + MCP** (migrations, RLS, type generation, security advisors).

## 4. Architecture & Assessment Lifecycle

Three states; all writes server-side via the service-role client.

```
ANONYMOUS                                  CLAIMED (owned)
─────────                                  ───────────────
/assess (client flow)
  wizard → POST /api/assess
    ├─ runAssessment (server, unchanged)
    ├─ service-role INSERT assessments
    │    (owner=null, profile, result,
    │     rule_version, expires_at = now + 3 days)
    └─ returns { id, payload }
  recap → results (renders in-memory payload)
  [ Continue with Google ]
    → supabase.auth.signInWithOAuth(
        provider: "google",
        options.redirectTo: /auth/callback?claim=<id> )
                │
                ▼
  /auth/callback (server route)
    ├─ exchangeCodeForSession(code)
    ├─ service-role claim:
    │    UPDATE assessments
    │       SET owner = uid, claimed_at = now()
    │     WHERE id = <claim> AND owner IS NULL AND expires_at > now()
    └─ redirect → /assessment/<id>
                                           │
                                           ▼
                              /assessment/[id] (server component)
                                ├─ read via user's server client (RLS: owner = auth.uid())
                                ├─ render Results in "owned" mode:
                                │     full matches unblurred,
                                │     teasers → "coming soon",
                                │     no conversion section
                                └─ notFound() if not owner / missing
```

- The anonymous user **never reads the DB** — they render the in-memory payload from `/api/assess`. The row exists only to survive the OAuth redirect and be claimed.
- The id is an unguessable UUID carried through OAuth `redirectTo`. Claim is first-write-wins (`owner IS NULL`) and expiry-guarded.
- Session cookies are refreshed by a new `middleware.ts` (the `@supabase/ssr` pattern).

## 5. Database Schema & RLS

**Validated live** against the Merovisa project (Postgres 17) during design, then **hardened against the Supabase postgres-best-practices skill** (FK indexing, partial index, atomic upsert key, least-privilege grants, FORCE RLS). Final state: security advisors clean (only the intended `INFO` on `leads`); performance advisors show no real issues (only `unused_index` notes, an artifact of empty/never-queried tables that clear under traffic); anon is grant-revoked on both tables; `authenticated` holds SELECT-only on `assessments`.

```sql
create table public.assessments (
  id           uuid primary key default gen_random_uuid(),   -- unguessable capability id (carried in OAuth redirect + /assessment/[id] URL)
  owner        uuid references auth.users(id) on delete cascade,   -- null = anonymous
  profile      jsonb       not null,        -- StudentProfile
  result       jsonb       not null,        -- AssessmentResult snapshot
  rule_version text        not null,        -- e.g. "v0.1.0"
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,        -- created_at + 3 days
  claimed_at   timestamptz                  -- set when owner is assigned
);
-- Partial index: the RLS policy only ever matches non-null owners; anonymous
-- rows (owner is null) are never returned, so keep them out of the index.
create index assessments_owner_idx on public.assessments (owner) where owner is not null;

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid references public.assessments(id) on delete cascade,
  email         text        not null,
  consent_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint leads_assessment_email_uniq unique (assessment_id, email)  -- enables atomic ON CONFLICT DO NOTHING
);
-- Index the FK (Postgres does not auto-index FKs; flagged by the perf advisor otherwise).
create index leads_assessment_id_idx on public.leads (assessment_id);

alter table public.assessments enable row level security;
alter table public.leads        enable row level security;
-- Defense-in-depth: enforce RLS even for the table-owner role. (service_role still
-- bypasses via BYPASSRLS, which is what server-side privileged writes rely on.)
alter table public.assessments force row level security;
alter table public.leads        force row level security;

-- Owner-only reads. (select auth.uid()) is evaluated once per query, not per row.
create policy assessments_select_own
  on public.assessments
  for select
  to authenticated
  using ((select auth.uid()) = owner);
-- leads: intentionally no policies -> RLS denies anon/authenticated (service-role only).

-- Least privilege: anon never touches these tables; authenticated reads assessments only.
revoke all on public.assessments from anon;
revoke all on public.assessments from authenticated;
grant  select on public.assessments to authenticated;     -- gated by the owner RLS policy
revoke all on public.leads from anon, authenticated;       -- service-role only
```

**RLS + privilege model:**

| Table | anon | authenticated | service_role (server) |
|-------|------|---------------|------------------------|
| `assessments` | no grant (blocked at grant level) | `SELECT` only, RLS `owner = auth.uid()` | full (BYPASSRLS) — anon insert, claim |
| `leads` | no grant | no grant | full (BYPASSRLS) — lead capture |

The only client-facing capability is "a signed-in user reads their own assessments." Everything else is server-side privileged code.

**Primary-key choice:** `gen_random_uuid()` (UUIDv4) is kept deliberately — the id is an exposed capability (OAuth redirect + results URL) so it must be unguessable and non-enumerable (ruling out `bigint identity`). The best-practices note about UUIDv4 index fragmentation applies to large, high-write tables; at MVP scale (one row per assessment) it's negligible, and adding the `pg_uuidv7` extension isn't worth it now.

**Migration hygiene:** the original draft is recorded as `init_assessments_and_leads` in the remote project history, but the repo has no `supabase/` directory. Plan 3 runs `supabase init`, commits the migration file (the hardened SQL above) under `supabase/migrations/`, and regenerates `lib/supabase/types.ts` via the MCP `generate_typescript_types`. After committing, re-run `get_advisors` (security **and** performance) and fix anything beyond the known benign INFO notes.

## 6. Module & File Structure

```
middleware.ts                          NEW — refresh Supabase session cookies (@supabase/ssr)
supabase/
  config.toml                          NEW — CLI project config (supabase init)
  migrations/<ts>_init_assessments_and_leads.sql   NEW — the validated schema

lib/supabase/
  admin.ts                             NEW — service-role client (server-only privileged writes)
  types.ts                             REGEN via Supabase MCP generate_typescript_types
lib/assessments/
  repo.ts                              NEW — createAnonymousAssessment, claimAssessment,
                                              getOwnedAssessment, createLead
  expiry.ts                            NEW — 3-day window helper (pure, unit-tested)
lib/validation/
  lead.ts                              NEW — Zod schema for lead-capture body

app/api/assess/route.ts                MODIFY — persist anon row (service role), return { id, payload }
app/api/leads/route.ts                 NEW — POST lead capture (Zod-validated)
app/auth/callback/route.ts             NEW — exchangeCodeForSession → claim → redirect
app/auth/signout/route.ts             NEW — sign out
app/assessment/[id]/page.tsx           NEW — server component, owner-only read, Results unlocked

components/results/
  results.tsx                          MODIFY — accept mode: "anonymous" | "owned"
  university-matches.tsx               MODIFY — locked vs unlocked (full list)
  gated-teasers.tsx                    MODIFY — locked vs "coming soon" (signed-in)
  conversion-paths.tsx                 MODIFY — Tier 1 → signInWithOAuth(google); Tier 2 → POST /api/leads
components/assess/assess-flow.tsx      MODIFY — carry assessment id; wire "Continue with Google"
```

Each `lib` unit has one responsibility and is unit-testable with a mocked Supabase client; routes are thin orchestration over `repo.ts`. Scoring is untouched and stays server-side.

## 7. Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| `/api/assess` valid but DB insert fails | Return `200 { payload, id: null }` — user still sees results; signup just can't claim. Log server-side. (Results are recomputable, so a write failure never blocks core value.) |
| `/api/assess` invalid body / malformed JSON | `422` / `400` (unchanged from Plan 2). |
| OAuth callback missing/expired code | Redirect to `/assess` with a soft banner ("Sign-in didn't complete — your assessment is still here"). |
| Claim: row already owned (self) | No-op (`WHERE owner IS NULL`); still redirect to `/assessment/[id]`. |
| Claim: row owned by someone else | RLS read 404s → "This assessment isn't available." |
| Claim: row expired (unclaimed, >3 days) | Guard fails; redirect to `/assess` with "That assessment expired — here's a fresh start." |
| `/assessment/[id]` not signed in | Redirect to `/assess`. |
| `/assessment/[id]` signed in, not owner / missing | `notFound()` → calm 404; RLS guarantees no leak. |
| `/api/leads` invalid email | `422`; UI keeps form + inline validation. |
| `/api/leads` duplicate email+assessment | Atomic idempotent success via `insert ... on conflict (assessment_id, email) do nothing` (backed by `leads_assessment_email_uniq`). |
| Service-role key missing | `admin.ts` throws server-side only; never reaches client. |

## 8. Testing Strategy

- **Unit (Vitest + mocked Supabase client):** `repo.ts` (correct op per function; claim guards owner-null + expiry; `getOwnedAssessment` null on no-row), `expiry.ts` (pure math), `lead.ts` (Zod), `conversion-paths.tsx` (Tier 1 calls `signInWithOAuth` with correct `redirectTo`; Tier 2 POSTs `/api/leads` + ack), `results.tsx`/`university-matches.tsx`/`gated-teasers.tsx` (`anonymous` vs `owned` rendering).
- **Route tests:** `/api/assess` returns `{ id, payload }` and tolerates failing insert (id null, still 200); `/api/leads` 200/422; callback claim logic (owner-null + expiry guards) with a mocked admin client.
- **RLS + advisors:** verified live during design (security **and** performance advisors + anon/non-owner simulations + grant inspection). Plan 3 re-runs `get_advisors` (both types) after the committed migration and documents an MCP verification step (not a Vitest test — RLS needs real Postgres).
- **Lead idempotency:** `repo.createLead` uses `on conflict (assessment_id, email) do nothing`; a unit test asserts a repeated capture does not error and does not duplicate.
- **Full gate:** `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` all green before finishing.

## 9. Security Notes (Supabase checklist applied)

- Service-role key is **server-only** (`admin.ts`), never imported into a client component or a `NEXT_PUBLIC_` var.
- RLS enabled on every table from creation; deny-by-default; owner predicate uses `(select auth.uid())`.
- No authorization decisions read `user_metadata`.
- No `SECURITY DEFINER` functions, no views.
- `@supabase/ssr` and `@supabase/supabase-js` versions pinned; lockfile committed.
- No sensitive data in URLs (the assessment id is an opaque UUID capability, not PII; profile/score live server-side).

## 10. Open Setup Dependencies (not code)

- A Google Cloud OAuth client (id/secret) must be configured in the Supabase project's Auth → Providers for live Google sign-in. The code paths are testable with mocks; live OAuth needs this one-time provider config. Dev can be configured now; production provider/redirect URLs land with the Plan 4 deploy.
