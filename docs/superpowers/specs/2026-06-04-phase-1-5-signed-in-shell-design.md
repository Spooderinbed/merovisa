# Phase 1.5: Signed-in shell + multi-assessment foundation — design spec

**Date:** 2026-06-04
**Status:** Approved (user delegated decision-making to controller).
**Supersedes:** nothing. Extends `2026-06-04-marketing-and-shell-design.md` (Phases 1 + new chrome work).

---

## 1. Goal

Take MyVisa from "signed-out marketing site that supports a wizard run" to a real signed-in product: when a user is authenticated they get a logged-in chrome (avatar, dashboard, sign-out), they can edit basic profile info, their primary assessment surfaces on a dashboard, and clicking "Check eligibility" from anywhere does the right thing — refresh the current assessment or start a new destination.

This phase bundles three coupled needs the user surfaced:
1. **Signed-in chrome** — AppBar shows identity, FocusBar drops the "no sign-up to start" copy, `/auth` redirects to dashboard.
2. **Persistent product state** — multi-assessment / profile foundation lands so the dashboard has something real to read.
3. **Dashboard + minimal profile** — command-layout dashboard with snapshot + completeness, profile page with name/email and 13 read-only sections plus inline edit on "personal".

## 2. Out of scope (explicit deferrals)

- Editing the other 12 profile sections (Phase 2).
- Real matches / scholarships / cost estimate tabs (Phase 3 — depends on the running Nepal→Australia research).
- Plan generator (Phase 4).
- Document uploads / per-program checklist (Phase 5).
- Guide AI chat (Phase 6).
- A real `recent updates` feed — the dashboard card is present as a layout placeholder ("No updates yet").
- A real journey timeline state machine — Phase 1.5 ships a simple "current step" indicator based on what data the user already has.

Stub pages for `/matches`, `/plan`, `/checklist`, `/guide` ship inside the `(app)` shell so navigation is intact, but their bodies are a single "Coming soon — landing in Phase N" panel.

## 3. Routes & layout chrome

### 3.1 Route map

```
app/
├── (marketing)/                       signed-in-aware AppBar + Footer
│   ├── layout.tsx                     MODIFIED — read session, pass user to AppBar
│   ├── page.tsx, destinations/*, how/page.tsx, trust/page.tsx, auth/page.tsx  (unchanged routes)
│
├── (focused)/                         signed-in-aware FocusBar
│   ├── layout.tsx                     MODIFIED — read session, pass signedIn to FocusBar
│   ├── assess/page.tsx                MODIFIED — signed-in interstitial branch
│   └── assessment/[id]/page.tsx       (unchanged)
│
├── (app)/                             NEW — protected route group; AppBar "app" variant + Footer
│   ├── layout.tsx                     NEW — server-side redirect to /auth?next=<path> if no user
│   ├── dashboard/page.tsx             NEW — command layout
│   ├── profile/page.tsx               NEW — 13 sections + personal editor
│   ├── matches/page.tsx               NEW (stub)
│   ├── plan/page.tsx                  NEW (stub)
│   ├── checklist/page.tsx             NEW (stub — no [programId] yet)
│   └── guide/page.tsx                 NEW (stub)
│
├── api/profile/section/route.ts       NEW — PATCH personal section
├── auth/callback/route.ts             MODIFIED — when no claim, redirect to /dashboard (was /)
└── (root layout, api, auth/signout)   unchanged
```

### 3.2 Chrome variants

**AppBar** (`components/layout/app-bar.tsx`) gains two new variants. Final union:

| Variant | Used by | Shows |
|---|---|---|
| `"marketing"` | `(marketing)/layout.tsx` when signed-out | Logo + public nav + Sign in + Check eligibility CTA |
| `"marketing-signed-in"` | `(marketing)/layout.tsx` when signed-in | Logo + public nav + `<UserPill>` (avatar; no Sign in; CTA replaced by "Open dashboard") |
| `"app"` | `(app)/layout.tsx` | Logo + signed-in nav (Home / Matches / My plan / Profile / Guide / Destinations) + `<UserPill>` |

The exhaustiveness guard (`variant satisfies never`) still holds; adding a fourth variant later is a compile error.

**FocusBar** (`components/layout/focus-bar.tsx`) gains a `signedIn?: boolean` prop. When true, the "no sign-up to start" mono note is hidden.

**UserPill** (`components/layout/user-pill.tsx`) — new client component. Avatar circle (initials), opens a small menu (Dashboard, Profile, Sign out — last calls `POST /auth/signout`).

### 3.3 Auth-gated routing

- `(app)/layout.tsx` calls `createSupabaseServerClient().auth.getUser()`. If no user → `redirect("/auth?next=" + encodeURIComponent(pathname))`. `/auth/page.tsx` already redirects signed-in users away from itself; it now reads `?next=` and redirects there if present (defaults to `/dashboard`).
- `/auth/callback/route.ts` — when there's no `?claim=` parameter, redirect to `/dashboard` instead of `/`.

## 4. Data model

### 4.1 Migration: `add_profiles_evolve_assessments`

```sql
-- 1. profiles table
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null unique references auth.users(id) on delete cascade,
  sections     jsonb not null default '{}'::jsonb,
  completeness int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_owner_idx on public.profiles (owner);

-- 2. set_updated_at trigger (kept in a private schema)
create schema if not exists private;

create or replace function private.set_updated_at()
  returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- 3. RLS on profiles
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = owner);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- 4. evolve assessments: add new cols, backfill, drop legacy `profile` col
alter table public.assessments
  add column destination_id   text,
  add column is_primary       boolean not null default false,
  add column profile_snapshot jsonb;

update public.assessments
  set profile_snapshot = profile
  where profile_snapshot is null;

update public.assessments
  set destination_id = coalesce(profile_snapshot->>'destination', 'australia')
  where destination_id is null;

alter table public.assessments
  alter column destination_id   set not null,
  alter column profile_snapshot set not null,
  drop column profile;

-- 5. enforce at-most-one-primary per owner
create unique index assessments_primary_idx on public.assessments (owner) where is_primary;
```

### 4.2 What stays in `assessments.result` jsonb

Unchanged. The `AssessmentPayload` snapshot (verdict, dimensions, matches, intake, accuracy) continues to live in `result` so `/assessment/[id]` keeps rendering exactly what the user saw on the day of the run.

### 4.3 Profile sections shape

```ts
// lib/profiles/sections.ts
export const SECTION_KEYS = [
  "personal", "destination", "academic", "intended-study", "english",
  "gap", "work", "finance", "immigration", "family", "career",
  "scholarships", "deal-breakers",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface ProfileSections {
  personal?:        { name?: string; age?: number; intakeIso?: string };
  destination?:     { primary?: string; alternates?: string[] };
  academic?:        { institution?: string; degree?: string; gradePercent?: number; gradeSystem?: string };
  "intended-study"?: { level?: string; field?: string; specialisation?: string };
  english?:         { test?: "ielts" | "pte" | "toefl"; overall?: number; reportUploaded?: boolean };
  gap?:             { years?: number; reasons?: string[]; evidence?: string[] };
  work?:            { title?: string; years?: number; relevance?: string; docs?: boolean };
  finance?:         { total?: number; currency?: string; source?: string; proofUploaded?: boolean };
  immigration?:     { refusals?: string; travelled?: boolean };
  family?:          { situation?: string };
  career?:          { goal?: string; targetRole?: string };
  scholarships?:    { profile?: string[] };
  "deal-breakers"?: { mustHaves?: string[] };
}
```

Each key is optional and stored partially — the wizard / claim flow fills "personal", "destination", "academic", "intended-study", "english", "gap", "work", "finance" from the existing wizard answers. Other sections start empty and become editable in Phase 2.

### 4.4 Completeness

```
status(section) = "complete" if all required fields filled
                  "partial"  if any required field filled
                  "empty"    otherwise

weights = complete:1, partial:0.5, empty:0
pct = round(sum(weights) / SECTION_KEYS.length * 100)
```

`required fields` per section is a small constant map in `lib/profiles/sections.ts`. Calc is pure (no I/O) → testable.

### 4.5 Claim flow update

`lib/assessments/claim.ts` becomes a single function `claimAndBootstrapProfile(adminDb, {assessmentId, userId, googleName?})`:

1. `UPDATE assessments SET owner = userId, claimed_at = now() WHERE id = ? AND owner IS NULL AND expires_at > now() RETURNING profile_snapshot, destination_id`. Rollback if no row matched.
2. `INSERT INTO profiles (owner, sections, completeness) VALUES (...) ON CONFLICT (owner) DO NOTHING` — sections derived from the assessment's `profile_snapshot` via `lib/profiles/from-assessment.ts`. If insert happened, completeness recomputed.
3. `UPDATE assessments SET is_primary = true WHERE id = ? AND NOT EXISTS (SELECT 1 FROM assessments a2 WHERE a2.owner = userId AND a2.is_primary)` — sets primary only if user has no other primary.

The OAuth callback (`app/auth/callback/route.ts`) calls this new function instead of `claimAssessment` directly. `googleName` is extracted from `data.user.user_metadata.full_name` if present and stored in `profile.sections.personal.name` as the default — overwritable from the profile editor.

### 4.6 Assessments repo additions

```ts
// lib/assessments/repo.ts (additions, not replacements)
export async function getPrimaryAssessmentForUser(db: DB, userId: string): Promise<AssessmentRow | null>;
export async function listAssessmentsForUser(db: DB, userId: string): Promise<AssessmentRow[]>;
```

Both `to authenticated` reads via RLS — no service role needed.

## 5. Per-domain modules

### 5.1 `lib/profiles/`

```
lib/profiles/
├── repo.ts            getProfile, upsertProfileFromAssessment, patchProfileSection
├── sections.ts        SECTION_KEYS, ProfileSections, REQUIRED_FIELDS per section
├── completeness.ts    pure computeCompleteness(sections) → { pct, status: Record<SectionKey, "complete"|"partial"|"empty"> }
├── from-assessment.ts pure profileSectionsFromAssessment(profileSnapshot, fallback: { name? }): ProfileSections
└── types.ts           re-exports for ergonomic imports
```

`from-assessment.ts` is the mapper from the wizard's `profile` jsonb shape (the existing `StudentProfile` Zod type) to the new `ProfileSections` shape. Pure → fully unit-testable.

### 5.2 `lib/validation/profile-section.ts` (new)

```ts
import { z } from "zod";
export const PersonalSectionPatch = z.object({
  name:       z.string().min(1).max(120).optional(),
  age:        z.number().int().min(15).max(80).optional(),
  intakeIso:  z.string().date().optional(),
});
export type PersonalSectionPatch = z.infer<typeof PersonalSectionPatch>;
```

Phase 2 adds Zod schemas for the other 12 sections.

### 5.3 Components

```
components/
├── layout/
│   ├── app-bar.tsx                 MODIFIED  variants: marketing | marketing-signed-in | app
│   ├── focus-bar.tsx               MODIFIED  signedIn?: boolean prop
│   └── user-pill.tsx               NEW       client; avatar initials + dropdown menu
├── assess/
│   └── assess-interstitial.tsx     NEW       client; two buttons: Refresh / New destination
├── dashboard/
│   ├── greeting.tsx                NEW
│   ├── snapshot-card.tsx           NEW       reuses VerdictCard + FactorBars
│   ├── prompt-card.tsx             NEW       teal callout (IELTS upload placeholder logic)
│   ├── journey-timeline.tsx        NEW
│   ├── stats-row.tsx               NEW
│   └── recent-updates.tsx          NEW       empty-state placeholder for now
└── profile/
    ├── completeness-ring.tsx       NEW
    ├── section-accordion.tsx       NEW       collapsible row, status badge
    ├── section-summary.tsx         NEW       "23 · Nepal · July 2027 intake" style summary line
    └── editors/personal-editor.tsx NEW       client; POSTs PATCH /api/profile/section
```

### 5.4 Server vs client

- Server by default everywhere — `(app)` layout, all pages, AppBar, FocusBar
- Client only where state is needed: `UserPill` (dropdown open/close), `AssessInterstitial` (button handlers), `PersonalEditor` (form state + submit), and existing wizard/assess-flow

## 6. Routes — behavior details

### 6.1 `(app)/layout.tsx`

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const pathname = (await headers()).get("x-pathname") ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(pathname)}`);
  }
  return (
    <>
      <AppBar variant="app" user={data.user} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

`x-pathname` is read from a tiny header that `middleware.ts` (or a thin proxy) sets. Phase 1.5 includes a one-line addition to the existing middleware to copy the request path into `x-pathname` so layouts can recover it. Alternative if that proves tricky: hardcode `next=/dashboard` for Phase 1.5 (acceptable — there's only one entry point for now). **Spec choice: hardcode `next=/dashboard` and revisit when other (app) routes need different fallbacks.** Simpler and keeps middleware untouched.

### 6.2 `(focused)/assess/page.tsx`

Becomes:

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { AssessFlow } from "@/components/assess/assess-flow";
import { AssessInterstitial } from "@/components/assess/assess-interstitial";

export default async function AssessPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  // Signed-out → anonymous flow, unchanged
  if (!data.user) return <AssessFlow />;

  // Signed-in but no primary → run the wizard as themselves (no anonymous persist)
  const primary = await getPrimaryAssessmentForUser(supabase, data.user.id);
  if (!primary || params.new === "1") return <AssessFlow signedIn />;

  // Signed-in with primary → interstitial
  return <AssessInterstitial primary={primary} />;
}
```

`AssessFlow signedIn` (new prop) skips the anonymous persistence path; on completion it calls a new endpoint `POST /api/assess` with `?asUser=1` which persists directly with `owner = uid`, no expiry, and marks `is_primary = true` only if the user has no other primary.

(`/api/assess` already gates anonymous vs authenticated by reading the session — we just enrich its behavior.)

### 6.3 `(marketing)/layout.tsx`

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const variant = data.user ? "marketing-signed-in" : "marketing";
  return (
    <>
      <AppBar variant={variant} user={data.user ?? null} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

### 6.4 `(focused)/layout.tsx`

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FocusBar } from "@/components/layout/focus-bar";

export default async function FocusedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return (
    <>
      <FocusBar signedIn={!!data.user} />
      <main>{children}</main>
    </>
  );
}
```

### 6.5 Dashboard page

`app/(app)/dashboard/page.tsx`:

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { getProfile } from "@/lib/profiles/repo";
import { computeCompleteness } from "@/lib/profiles/completeness";
// ...component imports

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [primary, profile] = await Promise.all([
    getPrimaryAssessmentForUser(supabase, user!.id),
    getProfile(supabase, user!.id),
  ]);
  const completeness = profile ? computeCompleteness(profile.sections) : { pct: 0, status: {} };
  return (
    <div className="mx-auto w-full max-w-wrap px-5 py-10">
      <Greeting user={user!} profile={profile} />
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <SnapshotCard primary={primary} />
        <PromptCard profile={profile} />
      </div>
      <JourneyTimeline className="mt-6" profile={profile} primary={primary} />
      <StatsRow className="mt-6" primary={primary} completenessPct={completeness.pct} />
      <RecentUpdates className="mt-6" />
    </div>
  );
}
```

If the user has no primary assessment yet (signed up but never ran the wizard), `SnapshotCard` renders a "Run your first assessment" empty state with a `<Link href="/assess">` CTA.

### 6.6 Profile page

`app/(app)/profile/page.tsx`:

- Reads profile from DB
- Renders the completeness ring on the left
- Renders 13 `<SectionAccordion>` components on the right, each showing the title, a summary line ("23 · Nepal · July 2027 intake"), and a status pill
- The "Personal" accordion expands to a `<PersonalEditor>` (client component) with name / age / intake fields
- Other 12 sections render an "Edit · coming in Phase 2" disabled pill on expand
- Header above the ring: user's name (from sections.personal.name) and email (from auth.users)

### 6.7 Stub pages

`/matches`, `/plan`, `/checklist`, `/guide` each:

```tsx
import { Eyebrow } from "@/components/marketing/eyebrow";
import Link from "next/link";

export default function StubPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 py-16 text-center">
      <Eyebrow>Coming soon</Eyebrow>
      <h1 className="mt-4 text-[clamp(28px,3.4vw,40px)]">Matches landing in Phase 3.</h1>
      <p className="mx-auto mt-4 max-w-[52ch] text-[17px] text-ink-soft">
        We&apos;re wiring real Nepal → Australia program data right now. This page will show your shortlist,
        scholarships, and cost estimates against your profile.
      </p>
      <Link href="/dashboard" className="mt-7 inline-flex rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink">
        Back to dashboard
      </Link>
    </section>
  );
}
```

Each page customises the eyebrow line ("Coming soon"), headline ("Matches landing in Phase 3", "My plan landing in Phase 4", etc.), and body copy.

## 7. API surface

### 7.1 `POST /api/assess` — signed-in path

Same Zod-validated body. New branch:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (user) {
  // persist with owner = user.id, expires_at far-future,
  // set is_primary = true iff no other primary exists yet,
  // bootstrap profile if missing (same code path as claim).
  // Return { id, payload } shape (unchanged).
}
// Else: existing anonymous flow (unchanged).
```

### 7.2 `PATCH /api/profile/section`

Body:
```json
{ "section": "personal", "patch": { "name": "Aarav", "age": 23 } }
```

Server:
1. Auth check (`getUser` → 401 if absent)
2. Zod-validate per `section` (only "personal" supported in Phase 1.5; others 422 with "section not yet editable")
3. Read profile, deep-merge `patch` into `sections[section]`
4. Recompute completeness
5. UPDATE `profiles` row (RLS-protected — owner_id matches `auth.uid()`)
6. Return `{ ok: true, completeness }`

## 8. RLS recap (Phase 1.5 surface)

- `profiles`: SELECT + UPDATE for `auth.uid() = owner`; INSERT via service-role only (claim flow + signed-in fresh wizard).
- `assessments`: existing policy (SELECT owner-only) unchanged. New columns inherit it.
- `leads`: unchanged.

## 9. Error handling

| Surface | Failure | Behavior |
|---|---|---|
| `(app)` page no session | server | `redirect("/auth?next=/dashboard")` |
| Dashboard with no primary assessment | data | Empty state CTA → /assess |
| `PATCH /api/profile/section` invalid | client error | 422 with Zod issues |
| `PATCH /api/profile/section` for non-personal section | client error | 422 `{ error: "section not yet editable" }` |
| `POST /api/assess` signed-in DB failure | server | Falls back to returning `{ id: null, payload }` so the user still sees their result, just unsaved — same pattern as today's anonymous path |
| Claim flow profile bootstrap fails | server | Log + continue (the claim still succeeded; profile gets created on next sign-in via `getOrCreateProfile`) |
| Sign-out | client | POST → server clears cookies → redirect to / |

## 10. Testing strategy

| Layer | Test type |
|---|---|
| `computeCompleteness`, `profileSectionsFromAssessment` | pure Vitest unit (no mocks) |
| `claimAndBootstrapProfile`, `getPrimaryAssessmentForUser`, `patchProfileSection` | Vitest + `tests/helpers/fake-supabase.ts` |
| `/api/assess` signed-in branch, `/api/profile/section` | Vitest with mocked supabase server + admin clients |
| `AppBar` variants, `FocusBar` signedIn, `UserPill` open/close, `AssessInterstitial` clicks, `PersonalEditor` submit | RTL component tests |
| `(app)/layout` redirect, `(marketing)/layout` variant switch, `/dashboard`, `/profile`, stub pages, modified `/assess` | RTL page tests with mocked supabase server |

Existing wizard / results / `/assess` happy-path regressions continue to pass — they're guarded by the present suite.

## 11. Migration safety

- `assessments.profile → assessments.profile_snapshot` rename is non-destructive: backfill, then drop the old column in the same migration transaction.
- The unique partial index on `is_primary` is created after the backfill so it doesn't reject existing rows (no row has `is_primary = true` yet).
- The migration is idempotent on the `profiles` table because of `if not exists` on the trigger function and `create table` (which is fine — table doesn't exist yet).
- Tests run against an ephemeral supabase via the existing fake-supabase helper; no real DB writes during CI.

## 12. Acceptance criteria (Phase 1.5)

The phase ships when:
- Signing in via Google takes a new user to `/dashboard` (no claim) or `/assessment/[id]` (claim) and the AppBar shows their avatar.
- Signing out from anywhere returns the user to `/` with the marketing AppBar.
- `/dashboard` renders snapshot card + completeness + journey timeline + stats row + recent-updates empty state without errors when the user has a primary assessment.
- `/dashboard` shows a "Run your first assessment" empty state when the user has no primary.
- `/profile` shows the user's name + email at the top, 13 section accordions, completeness ring.
- Editing the personal section's name persists and the next page load reflects it.
- A signed-in user clicking "Check eligibility" from `/` is shown the interstitial with a "Refresh assessment" and "New destination" button.
- "Refresh assessment" re-runs the wizard pre-filled from their profile; on save, updates their primary.
- Stub pages render for `/matches`, `/plan`, `/checklist`, `/guide`.
- Anonymous wizard → results → OAuth claim → owned results regression is clean.
- Full test suite green; typecheck + lint + build clean.

## 13. Phasing context (post-1.5)

- **Phase 2** — full profile editor (12 remaining sections): adds Zod schemas + section editors. No new DB work.
- **Phase 3** — programs + matches: depends on the running Nepal → Australia research agent. Migration 2 lands `universities` / `programs` / `user_program_state`. Matches page becomes real.
- **Phase 4** — plan generator: migration 3. Plan page becomes real.
- **Phase 5** — checklist + uploads: migration 4 + Storage. Checklist page becomes real.
- **Phase 6** — guide chat: migration 5 + Anthropic integration. Guide page becomes real.

Each phase still gets its own brainstorm, spec, and implementation plan when we get to it.
