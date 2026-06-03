# Marketing surface + logged-in app shell — design spec

**Date:** 2026-06-04
**Status:** Approved through brainstorming; ready for implementation planning (Phase 0 first).
**Supersedes:** nothing. Extends `2026-06-02-onboarding-mvp-design.md` and `2026-06-03-auth-and-persistence-design.md`.
**Reference visuals:** `claudedesign/` prototype + screenshots captured at `/tmp/design-<view>-desktop.png` (`home`, `wizard`, `results`, `auth`, `dashboard`, `dashboard-feed`, `guide`, `checklist`, `matches`, `plan`, `profile`, `destinations`).

---

## 1. Goal

Take the MyVisa prototype in `claudedesign/` — a static React showcase of the full intended product — and stand it up inside the existing Next.js codebase as a real, multi-phase app: marketing chrome, logged-in shell, multi-destination assessments, programs in DB, ranked plan, per-program checklist, AI guide.

The existing onboarding wizard + results + OAuth claim flow is already shipped and must keep working end-to-end through every phase.

## 2. Decisions (locked during brainstorm)

1. **Scope target:** "everything with real data" — full app surface, not mocks.
2. **Decomposition:** **one design spec** (this doc) capturing target architecture + DB model; **seven phased implementation plans**, one per phase, written when ready.
3. **Profile/assessment model:** one editable `profiles` row per user; many `assessments` rows (profile × destination × timestamp). Marks the user's primary assessment for dashboard.
4. **Dashboard layout:** the "command" variant (snapshot-first) only. The "feed" variant in the prototype is shelved.
5. **Architecture:** conventional Next.js — route groups for `(marketing)/`, `(focused)/`, `(app)/`; per-domain repo files; universities + programs in DB; matches computed on-demand with TTL cache; server components by default.
6. **Auth screen:** ships the prototype design but the email field is hidden behind a disclosure until magic-link / email-pw is built.

## 3. Routes & layout chrome

### 3.1 File layout (target end-state)

```
app/
├── (marketing)/                      ← AppBar (signed-out) + Footer + TrustStrip
│   ├── layout.tsx
│   ├── page.tsx                      → /
│   ├── destinations/page.tsx         → /destinations
│   ├── destinations/[id]/page.tsx    → /destinations/au
│   ├── how/page.tsx                  → /how
│   ├── trust/page.tsx                → /trust
│   └── auth/page.tsx                 → /auth
│
├── (focused)/                        ← FocusBar
│   ├── layout.tsx
│   ├── assess/page.tsx               → /assess
│   └── assessment/[id]/page.tsx      → /assessment/[id]
│
├── (app)/                            ← AppBar (signed-in) — requires session
│   ├── layout.tsx                    server-side redirect to /auth?next=… on no user
│   ├── dashboard/page.tsx            → /dashboard
│   ├── matches/page.tsx              → /matches
│   ├── plan/page.tsx                 → /plan
│   ├── profile/page.tsx              → /profile
│   ├── guide/page.tsx                → /guide
│   └── checklist/[programId]/page.tsx → /checklist/:id
│
├── api/                              (existing routes + new per phase)
├── auth/callback/route.ts            (existing)
├── auth/signout/route.ts             (existing)
└── layout.tsx                        root: theme + fonts only
```

**Migrations from current state:**
- `app/page.tsx` → `app/(marketing)/page.tsx`
- `app/assess/page.tsx` → `app/(focused)/assess/page.tsx`
- `app/assessment/[id]/page.tsx` → `app/(focused)/assessment/[id]/page.tsx`

### 3.2 Shared layout components (new)

| Component | File | Purpose |
|---|---|---|
| `AppBar` | `components/layout/app-bar.tsx` | variant prop `"marketing" \| "app"`. Marketing: nav for How it works / Destinations / Why trust us + Sign in + Check eligibility CTA. App: nav for Home / Matches / My plan / Profile / Guide + bell + avatar. |
| `FocusBar` | `components/layout/focus-bar.tsx` | Logo + "no sign-up to start" mono note + theme toggle. Used by `(focused)/` group. |
| `Footer` | `components/layout/footer.tsx` | Three-column link list + trust line. Used by marketing routes + `/checklist/[id]`. |
| `TrustStrip` | `components/layout/trust-strip.tsx` | 38px top strip — shield icon + "No agents · no hidden commissions…" — only on `/`. |
| `Logo` | `components/layout/logo.tsx` | Cap icon + "MyVisa" wordmark. Used in both bars and footer. |

### 3.3 Auth flow reconciliation

- The existing in-results `ConversionPaths` component stays where it is. Tier 1 Google + Tier 2 email + Tier 3 come-back-later remain the conversion surface immediately after a wizard run.
- The new `/auth` page is for users who click "Sign in" from the AppBar — same `signInWithOAuth({provider: "google"})` path, redirect target is `/dashboard` instead of `/assessment/[id]`.
- `/auth/callback` (existing) handles both — when `?claim=` is set, it claims the assessment; when not, it just exchanges the code and redirects.
- The Claude Design auth screen renders a visible Google button plus a "Other ways to sign in →" disclosure that, when opened, reveals the email + "Create account & save" form. **The disclosure is shipped collapsed and the email path returns a coming-soon notice** until we add magic-link or password auth (out of scope here).

## 4. Database model

### 4.1 Target tables

```sql
-- Existing (Phase 0 unchanged)
assessments        -- evolved in Phase 1, see §4.2
leads              -- unchanged

-- New: Phase 1
profiles (
  id              uuid pk default gen_random_uuid(),
  owner           uuid not null unique references auth.users on delete cascade,
  sections        jsonb not null,                  -- the 13 sections
  completeness    int  not null default 0,         -- updated in app code on write
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- New: Phase 3
universities (
  id              text pk,                         -- e.g. "monash"
  country         text not null,
  name            text not null,
  city            text,
  ranking_tier    int,
  source          text,
  last_verified   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid                              -- nullable
);

programs (
  id              text pk,                         -- e.g. "monash-mit"
  university_id   text not null references universities(id) on delete cascade,
  name            text not null,
  level           text not null,                   -- "bachelors" | "masters" | "doctorate"
  field           text not null,                   -- field-of-study id
  tuition_min     numeric(12,2),
  tuition_max     numeric(12,2),
  tuition_currency text,
  min_grade       int,
  min_english     numeric(3,1),
  intakes         jsonb,
  source          text,
  last_verified   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid
);

user_program_state (
  owner           uuid not null references auth.users on delete cascade,
  program_id      text not null references programs(id) on delete cascade,
  status          text not null,                   -- "shortlisted" | "applied" | "withdrawn"
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (owner, program_id)
);

-- New: Phase 4
plan_items (
  id              bigint generated always as identity primary key,
  owner           uuid not null references auth.users on delete cascade,
  kind            text not null,                   -- generator-controlled (e.g., "upload-ielts")
  impact          text not null,                   -- "high" | "medium" | "low"
  title           text not null,
  body            text,
  lift_estimate   text,
  time_estimate   text,
  status          text not null default 'todo',    -- "todo" | "done" | "dismissed"
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

-- New: Phase 5
documents (
  id              uuid pk default gen_random_uuid(),
  owner           uuid not null references auth.users on delete cascade,
  kind            text not null,
  storage_path    text not null,                   -- in user-documents bucket
  mime            text,
  size_bytes      bigint,
  original_name   text,
  created_at      timestamptz not null default now()
);

checklist_items (
  id              bigint generated always as identity primary key,
  owner           uuid not null references auth.users on delete cascade,
  program_id      text not null references programs(id) on delete cascade,
  section         text not null,                   -- "identity" | "academic" | "financial" | "visa"
  title           text not null,
  body            text,
  status          text not null default 'todo',    -- "todo" | "done" | "na"
  document_id     uuid references documents(id) on delete set null,
  deadline        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- New: Phase 6
guide_threads (
  id              uuid pk default gen_random_uuid(),
  owner           uuid not null references auth.users on delete cascade,
  title           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

guide_messages (
  id              bigint generated always as identity primary key,
  thread_id       uuid not null references guide_threads(id) on delete cascade,
  role            text not null,                   -- "user" | "assistant"
  content         text not null,
  reasoning       jsonb,                           -- nullable
  created_at      timestamptz not null default now()
);
```

### 4.2 `assessments` evolution (Phase 1)

Current `assessments`:
- `profile jsonb not null` — wizard answers embedded
- `result jsonb not null` — full `AssessmentPayload`
- `rule_version`, `expires_at`, `claimed_at`, `owner`

After Phase 1 migration:
- **Add** `destination_id text not null` (e.g. `"au"`)
- **Add** `is_primary boolean not null default false`
- **Add** `profile_snapshot jsonb not null` (frozen profile at time of run)
- **Backfill** `profile_snapshot` from existing `profile` column
- **Drop** `profile` column

### 4.3 Indexes

```sql
-- existing
create index assessments_owner_idx on assessments (owner) where owner is not null;

-- Phase 1 additions
create unique index assessments_primary_idx on assessments (owner) where is_primary;
-- profiles.owner already gets an index via unique constraint

-- Phase 3
create index user_prog_state_program_idx on user_program_state (program_id);

-- Phase 4
create index plan_items_owner_idx on plan_items (owner);
create index plan_items_open_idx  on plan_items (owner, created_at desc) where status = 'todo';

-- Phase 5
create index documents_owner_idx       on documents (owner);
create index checklist_items_owner_idx on checklist_items (owner);
create index checklist_items_prog_idx  on checklist_items (program_id);
create index checklist_open_idx        on checklist_items (owner, deadline) where status = 'todo';

-- Phase 6
create index guide_threads_owner_idx   on guide_threads (owner);
create index guide_messages_thread_idx on guide_messages (thread_id);
```

JSONB GIN indexes deliberately deferred — we read whole `sections` / `result` blobs and parse in app code; no internal-JSON filtering planned.

### 4.4 RLS

```sql
-- profiles
alter table profiles enable row level security;
alter table profiles force  row level security;

create policy profiles_select_own on profiles
  for select to authenticated
  using ((select auth.uid()) = owner);

create policy profiles_update_own on profiles
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);
-- INSERT done via service-role only.

revoke all on profiles from anon;
revoke all on profiles from authenticated;
grant  select, update on profiles to authenticated;

-- universities + programs: public read for signed-in users
alter table universities enable row level security;
alter table universities force  row level security;
create policy universities_read_all on universities for select to authenticated using (true);
revoke all on universities from anon;
revoke all on universities from authenticated;
grant  select on universities to authenticated;
-- (same for programs)

-- user_program_state, plan_items, checklist_items, documents — owner-scoped SELECT/UPDATE,
-- service-role writes for creates/deletes that the generator owns.
-- Pattern (example):
create policy plan_items_select_own on plan_items
  for select to authenticated using ((select auth.uid()) = owner);
create policy plan_items_update_own on plan_items
  for update to authenticated using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

-- guide_threads — full owner CRUD
-- guide_messages — SELECT via security-definer helper to avoid per-row join:
create or replace function private.owns_thread(tid uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.guide_threads
    where id = tid and owner = (select auth.uid())
  );
$$;
revoke execute on function private.owns_thread(uuid)
  from public, anon, authenticated, service_role;

create policy guide_messages_select_own on guide_messages
  for select to authenticated
  using ((select private.owns_thread(thread_id)));
```

Locked-in patterns across every owner-scoped table:
- `(select auth.uid())` wrapping (existing best practice from the auth-persistence spec).
- `with check` on every UPDATE policy.
- Policies scoped `to authenticated` — never `public`.
- `force row level security` on owner-scoped tables.

### 4.5 Triggers

A single helper in a private schema, attached to tables with `updated_at`:

```sql
create or replace function private.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_set_updated_at
  before update on profiles for each row execute function private.set_updated_at();
-- (same for user_program_state, checklist_items, guide_threads, universities, programs)
```

### 4.6 Claim flow update (Phase 1)

When OAuth callback resolves with a valid `claim` assessment id:

1. `claimAssessment(id, userId)` — service-role UPDATE, bounded by `owner is null and expires_at > now()` (existing).
2. **New step:** if no `profiles` row exists for `userId`, insert one with `sections = assessment.profile_snapshot` (mapped via `lib/profiles/sections.ts`).
3. **New step:** if the user has no other primary assessment, mark the claimed assessment `is_primary = true`.

All three operations run in one transaction. On failure: rollback, user lands on `/assess?error=claim` with the assessment still anonymous-but-recoverable until `expires_at`.

### 4.7 Migration order

| Phase | Migration | Tables changed |
|---|---|---|
| 0 | — | — |
| 1 | `add_profiles_and_evolve_assessments` | + `profiles`; ± `assessments` |
| 3 | `add_universities_programs_state` | + `universities`, `programs`, `user_program_state` |
| 4 | `add_plan_items` | + `plan_items` |
| 5 | `add_documents_and_checklist` | + `documents`, `checklist_items`, Storage bucket + policy |
| 6 | `add_guide_threads_messages` | + `guide_threads`, `guide_messages`; + `private.owns_thread()` |

## 5. Per-domain module structure

### 5.1 `lib/` layout (target)

```
lib/
├── assessments/                 (existing — repo evolves in Phase 1)
│   ├── repo.ts                  + getPrimaryAssessmentForUser, listAssessmentsForUser
│   ├── claim.ts                 (new) — claim + profile promotion + set primary in one tx
│   └── expiry.ts                (existing)
│
├── profiles/                    (Phase 1)
│   ├── repo.ts, sections.ts, completeness.ts, types.ts
│
├── scoring/                     (existing; extended Phase 3)
│   └── multi-destination.ts     (new) — composeScoresForAllDestinations(profile)
│
├── results/                     (existing — unchanged shape)
│
├── data/                        (Phase 3 transitions)
│   ├── source/, destination/    static — stays
│   ├── universities/au.ts       Phase 3: becomes the seed for the migration; file removed after
│   └── fields-of-study.ts       static — stays
│
├── programs/                    (Phase 3)
│   ├── repo.ts, seed.ts, types.ts
│
├── matches/                     (Phase 3 — replaces lib/matching/universities.ts)
│   ├── compute.ts, repo.ts, types.ts
│
├── plan/                        (Phase 4)
│   ├── generator.ts, repo.ts, invalidate.ts, types.ts
│
├── checklist/                   (Phase 5)
│   ├── generator.ts, repo.ts, types.ts
│
├── documents/                   (Phase 5)
│   ├── repo.ts, storage.ts, types.ts
│
├── guide/                       (Phase 6)
│   ├── repo.ts, client.ts, stream.ts, types.ts
│
├── supabase/                    (existing — types regenerated after each migration)
├── validation/                  (existing — schema per phase)
├── labels.ts, utils.ts          (existing)
└── callouts/                    (existing)
```

### 5.2 `components/` layout (new directories per phase)

```
components/
├── layout/                      Phase 0  (app-bar, focus-bar, footer, trust-strip, logo)
├── marketing/                   Phase 0  (hero, hero-preview, tile, eyebrow, how-it-works)
├── destinations/                Phase 0  (destination-card, destination-detail)
├── auth/                        Phase 0  (auth-card)
├── wizard/, assess/, results/   existing — touched only for owned-mode source switch (Phase 1)
├── dashboard/                   Phase 1  (greeting, snapshot-card, prompt-card, journey-timeline, stats-row)
├── profile/                     Phase 2  (completeness-ring, section-accordion, section-editor/*)
├── matches/                     Phase 3  (matches-tabs, program-card, shortlist-toggle)
├── plan/                        Phase 4  (plan-list, plan-item-card, impact-pill)
├── checklist/                   Phase 5  (checklist-section, checklist-item, document-upload)
├── guide/                       Phase 6  (guide-thread, guide-message, suggested-prompts)
└── ui/                          existing — extracted Verdict, Tile, Eyebrow primitives over time
```

### 5.3 Conventions (locked, matching existing code)

- kebab-case files, PascalCase components, named exports.
- `import "server-only"` at the top of every repo, admin client, storage helper, guide client.
- Client components never import `lib/*/repo.ts` — they call `/api/*` routes.
- Per-domain `types.ts` colocated with the domain. Cross-domain types stay in their owning domain.
- Zod schemas live in `lib/validation/`. Types derive via `z.infer`.

### 5.4 API surface (additions per phase)

| Phase | Method + route | Notes |
|---|---|---|
| 0 | — | |
| 1 | `GET /api/dashboard` | hydrates the dashboard server-rendered page; auth-gated. |
| 2 | `PATCH /api/profile/section` | partial section update; revalidates `/profile`, `/dashboard`; calls `invalidatePlan(userId)`. |
| 3 | `GET /api/matches`, `POST /api/shortlist` | matches list + shortlist toggle. |
| 4 | `POST /api/plan/action` | mark done / dismiss. |
| 5 | `POST /api/documents/upload-url` | signed-upload URL; row inserted on completion via webhook or follow-up POST. |
| 5 | `PATCH /api/checklist/item` | toggle / attach document. |
| 6 | `POST /api/guide/threads` | create thread. |
| 6 | `POST /api/guide/messages` | post user message; **SSE** streams assistant response. |

## 6. Phase-by-phase rollout

Each phase is a separate implementation plan (written when ready). Each ships independently and leaves previous behavior intact. Dependency edges are strict — no skipping.

### Phase 0 — Marketing + chrome
**DB:** none. **Ships:** `/`, `/destinations`, `/destinations/[id]`, `/how`, `/trust`, `/auth`; AppBar/Footer/FocusBar/TrustStrip/Logo; route groups `(marketing)/` + `(focused)/`; relocate existing pages.
**Accepts:** prototype-matching design at desktop + mobile, existing wizard → results → ConversionPaths flow unchanged, all tests pass, build green.

### Phase 1 — Profiles + multi-assessment + dashboard
**DB:** migration 1 — `profiles` + assessments evolution. **Ships:** `(app)/layout.tsx`, `/dashboard` (command layout), `lib/profiles/*`, evolved claim flow, dashboard components.
**Accepts:** existing anon-assessment → OAuth → owned results regression-clean; new signup creates a `profiles` row; `/dashboard` shows snapshot from primary assessment + completeness from profile; sign-out blocks `/dashboard`.

### Phase 2 — Profile editor
**DB:** none. **Ships:** `/profile` with all 13 sections, `PATCH /api/profile/section`, completeness ring.
**Accepts:** editing any section persists + updates completeness + invalidates plan; invalid input returns 422; RLS blocks cross-user access.

### Phase 3 — Programs in DB + matches + multi-destination scoring
**DB:** migration 2 — `universities`, `programs`, `user_program_state`. Seed data from existing TS. **Ships:** `lib/programs/*`, `lib/matches/*`, `lib/scoring/multi-destination.ts`, `/matches`, `GET /api/matches`, `POST /api/shortlist`; retire `lib/matching/universities.ts`.
**Accepts:** `/matches` shows Strong/Possible/Reach groups for primary destination; shortlisting persists; cost-estimate tab works; adding a program is a single INSERT.

### Phase 4 — Plan generator + ranked actions
**DB:** migration 3 — `plan_items`. **Ships:** `lib/plan/*`, `/plan`, `POST /api/plan/action`; invalidation hooks from profile and assess endpoints.
**Accepts:** low-completeness signup → plan shows "complete profile" + factor-specific items; mark-done persists; profile edit regenerates plan while preserving user-marked-done items where still applicable.

### Phase 5 — Checklist + document uploads
**DB:** migration 4 — `documents`, `checklist_items`; Storage bucket `user-documents` with owner policy. **Ships:** `lib/documents/*`, `lib/checklist/*`, `/checklist/[programId]`, `POST /api/documents/upload-url`, `PATCH /api/checklist/item`.
**Accepts:** shortlist → checklist auto-generated, grouped; upload flips item to done + linked doc; signed read URLs short-lived; cross-user read blocked.

### Phase 6 — Guide chat
**DB:** migration 5 — `guide_threads`, `guide_messages`, `private.owns_thread()`. **Ships:** Anthropic-backed `/guide`, SSE message streaming, suggested prompts, thread history. System prompt built from current profile + primary assessment + recent matches; prompt-cached.
**Accepts:** message streams token-by-token; thread persists; reload shows history; logs measure cache hit rate; RLS guarantees thread isolation.

### Dependency graph

```
                                          ┌─→ Phase 4 ─┐
Phase 0 ─→ Phase 1 ─→ Phase 2 ─→ Phase 3 ─┤            ├─→ Phase 6
                                          └─→ Phase 5 ─┘
```

Phase 4 (plan) and Phase 5 (checklist) are parallel — both depend on Phase 3 but neither on each other. Recommended delivery order is 4 then 5 to keep cognitive load low; reverse is allowed if priorities shift.

### What gets retired

| Replaced | Phase | By |
|---|---|---|
| `lib/data/universities/au.ts` (TS static) | 3 | `lib/programs/repo.ts` |
| `lib/matching/universities.ts` | 3 | `lib/matches/compute.ts` |
| `app/page.tsx` (placeholder) | 0 | `app/(marketing)/page.tsx` |
| `/assessment/[id]` as sole post-signup home | 1 | `/dashboard`; `/assessment/[id]` linked from dashboard |

## 7. Cross-cutting concerns

### 7.1 RLS recap

See §4.4. Every owner-scoped table: `(select auth.uid())`-wrapped policies, `with check` on UPDATE, scoped `to authenticated`, `force row level security`.

### 7.2 Error handling

| Surface | Failure | Behavior |
|---|---|---|
| Marketing pages | — | static; never SSR-errors. `not-found.tsx` per route group. |
| API routes | bad JSON | 400 |
| API routes | invalid input | 422 with `{ error, issues }` from Zod |
| API routes | DB write fails | 500 with opaque message; full error logged server-side. Assess route specifically falls back to in-memory result so the user still sees a verdict (existing behavior, preserved). |
| Logged-in pages | DB read fails | error boundary rendering "We couldn't load this section" inside the chrome. |
| Owner-only pages | not-owner / not-found | `notFound()` — 404, never "forbidden" (no existence leak). |
| Auth-gated pages | no session | server-side `redirect("/auth?next={path}")` from `(app)/layout.tsx`. |
| Plan / matches / checklist generator | partial data | skip the item, log; never throw. |

No exposed stack traces in production responses. Sentry integration is a post-MVP production-hardening line item (see existing deferred roadmap in `docs/superpowers/plans/`), out of scope here.

### 7.3 Validation boundary

Zod runs at every server-side write entry point. Repo functions assume validated input — no double validation. Schemas live in `lib/validation/`. TypeScript types are derived via `z.infer`, never hand-authored.

### 7.4 Env config

| Var | Used by | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | public |
| `SUPABASE_SERVICE_ROLE_KEY` | admin client only | server-only — never imported by `app/` or `components/` |
| `ANTHROPIC_API_KEY` | `lib/guide/client.ts` | server-only (Phase 6) |
| `NEXT_PUBLIC_SITE_URL` | OAuth `redirectTo`, share links | public |

`.env.example` ships with empty values + per-var comments. Service role key in `.env.local` only.

### 7.5 Testing strategy

| Layer | Test type |
|---|---|
| Scoring engine, plan generator, checklist generator, completeness calc, multi-destination wrapper | Pure Vitest unit tests, no mocks |
| Repo functions | Vitest + `tests/helpers/fake-supabase.ts` (existing chainable stub) |
| API routes | Vitest with mocked repos and admin client (existing pattern) |
| React components | RTL with mocked props |
| Page components | RTL with mocked `createSupabaseServerClient`, `notFound`, `redirect` |
| Auth-gated layouts | one focused "redirects when no user" test per route group |
| RLS | `get_advisors` via Supabase MCP after each migration; manual cross-user SQL check |
| E2E | deferred — manual smoke test per phase before deploy; Playwright is a post-MVP production-hardening item |

Coverage targets: pure modules 100%, repos 80%+ happy + sad paths, components only for obvious-break cases.

### 7.6 Observability hooks (designed-for, wired later)

- Every API route logs `{ route, userId, ms, status }` (JSON).
- Every repo write logs `{ op, table, rowsAffected }` on success, full error on failure.
- Guide chat logs `{ thread_id, message_id, model, input_tokens, output_tokens, cache_read, ms }` per response.
- No PII in logs ever (no raw sections, email, document filenames).

### 7.7 Performance budgets (soft, revisit if missed)

| Page | TTFB | LCP | JS gzipped |
|---|---|---|---|
| Marketing (`/`, `/destinations`, `/auth`) | < 200ms | < 1.5s | < 80 KB |
| Wizard / Results | < 250ms | < 1.8s | < 130 KB |
| Dashboard | < 350ms | < 2s | < 100 KB |
| Matches, Plan, Profile, Checklist | < 400ms | < 2.2s | < 130 KB |
| Guide | < 400ms first paint, streamed response | n/a | < 110 KB |

### 7.8 Out of scope (so this spec doesn't grow)

- Magic-link / passwordless email auth (auth screen ships with email path hidden)
- Multi-region deployments
- Mobile native apps
- Admin console for editing programs
- Real-time collaborative features
- A/B testing of dashboard variants (command-only)
- SOP coach (stays a "Soon" tile through every phase)

## 8. Risks and known unknowns

| Risk | Phase | Mitigation |
|---|---|---|
| `assessments` migration drops `profile` column — irreversible | 1 | Backfill `profile_snapshot` first; only drop after verified row count match; migration is a single transaction. |
| Multi-destination scoring may diverge from single-destination engine over time | 3 | `multi-destination.ts` is a wrapper around `composeScores`, not a fork. Tests assert parity for the primary destination. |
| Plan generator regenerates and clobbers user-marked-done items | 4 | Generator only INSERTs items whose `kind` is not already present for the user; user-marked-done rows stay. |
| Document storage paths leak via signed URLs | 5 | Short-lived signed URLs (max 60s); storage policy double-checks owner. |
| Guide chat blows the prompt cache budget | 6 | Cache the static system block (rules, design, etc.); user/profile context goes outside cache. Log cache hit rate per response. |
| Live profile editing produces a verdict that contradicts a saved assessment | 2 | Dashboard surfaces "your verdict may have shifted — refresh assessment" callout when profile updated_at > primary assessment.created_at. (Phase 2 follow-up if not in MVP scope.) |
| No admin UI for editing programs after Phase 3 retires the static TS file | 3 | New programs go via SQL migration committed to the repo (one INSERT per program). Admin console is explicitly out of scope (§7.8). Process: maintainer writes a migration, runs `npx supabase migration new add_program_<id>`, commits. Acceptable while program count is small. |

## 9. Open questions to resolve before later phases

- **Phase 2:** does editing a profile section auto-create a new assessment, or just flag the old one stale? Current spec: flag stale, user re-runs wizard.
- **Phase 4:** plan generator behavior when there are zero shortlisted programs — show generic country-level items, or show empty state? Default to generic.
- **Phase 6:** which Anthropic model? Sonnet for cost/latency balance; Opus for hard reasoning fallback. Decided per Claude API skill at build time.
- **Phase 6:** retention of guide messages — indefinite or 90-day rolling? Default indefinite; user can delete a thread.

## 10. Acceptance for the design itself

This spec is complete when:
- Every phase has clear entry/exit criteria.
- Every new table has columns, indexes, and RLS specified.
- Every cross-cutting concern (RLS, errors, validation, env, testing, observability, performance) has a locked-in pattern.
- All routes have a layout group assigned.
- The "what gets retired" table covers every existing module that's replaced.

Ready for `writing-plans` to produce Phase 0's implementation plan next.
