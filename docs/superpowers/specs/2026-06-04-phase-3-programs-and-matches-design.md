# Phase 3: Programs + matches with real data — design spec

**Date:** 2026-06-04
**Status:** Approved (autonomous).
**Extends:** Phase 2.

## 1. Goal

Replace the stub `/matches` page with a real one driven by a DB-backed catalog of Australian universities and programs, seeded from the research at `docs/research/2026-06-04-nepal-australia-data.md`. Compute matches against the user's profile using a new `lib/matches/` module, group them by verdict (Strong / Possible / Reach), and let users shortlist programs.

The legacy `lib/matching/universities.ts` (single TS file, single destination, 8 hard-coded entries) is retired in this phase. Multi-destination scoring is implemented but only Australia is seeded — Canada/UK/Germany/US/Ireland become live in a future phase by adding rows.

## 2. Decisions (locked)

1. **Programs in DB, not TS.** New tables `universities`, `programs`, `user_program_state`. Migration 2.
2. **Seed from the research report** — 15 universities × 3-5 programs each ≈ 60 programs. Each row carries `source`, `last_verified`, and a `data_quality` tag (`primary` | `derived`) to honor the research caveats.
3. **Match computation is server-side.** No client-side matching. `lib/matches/compute.ts` is pure (`profile + programs + destination → MatchResult[]`); the page calls it via a repo function that fetches programs first.
4. **No cached `user_matches` table** — recompute per request for now. Cost is tiny (50 rows joined to a user profile in memory). Add caching when we have data showing it's needed.
5. **Match verdict per program** uses the existing scoring engine's threshold logic, applied per-program: a program is **Strong** if the user clears its `min_grade` and `min_english` and budget covers `tuition_min`; **Possible** if 1 of the 3 falls short by < 10%; **Reach** otherwise. Pure function.
6. **Shortlisting persists** in `user_program_state` (composite PK `(owner, program_id)`, status `shortlisted | applied | withdrawn`).
7. **`/matches` page** is tabs: Universities / Scholarships / Cost estimate. Phase 3 ships Universities tab fully; Scholarships and Cost estimate are placeholders ("Coming soon"). Scholarships becomes real in Phase 4 (alongside Plan).
8. **Multi-destination scoring** lands as `lib/scoring/multi-destination.ts` — wraps existing single-destination engine; runs against every distinct destination in `programs`. Used by a future Compare-destinations view; not surfaced in Phase 3.
9. **Nepal Assessment Level 3** flag (from research, effective 2026-01-09) is encoded as a policy version constant in `lib/programs/policy.ts` and surfaced in the visa-case scoring (raises required bank seasoning + tightens GS narrative requirements).

## 3. DB migration

```sql
-- universities
create table public.universities (
  id              text primary key,                      -- slug e.g. "monash"
  country         text not null,                         -- "AU"
  name            text not null,
  city            text not null,
  ranking_tier    int  not null check (ranking_tier between 1 and 3),
  source          text,
  last_verified   date,
  data_quality    text not null default 'primary' check (data_quality in ('primary','derived','secondary')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger universities_set_updated_at
  before update on public.universities for each row execute function private.set_updated_at();

-- programs
create table public.programs (
  id                text primary key,                    -- slug e.g. "monash-mit"
  university_id     text not null references public.universities(id) on delete cascade,
  name              text not null,
  level             text not null check (level in ('bachelors','masters','doctorate')),
  field             text not null,                       -- e.g. "computer-science"
  tuition_min       numeric(12,2),
  tuition_max       numeric(12,2),
  tuition_currency  text not null default 'AUD',
  min_grade         int,                                 -- Nepal TU % derived equivalent
  min_english       numeric(3,1),                        -- IELTS overall
  min_english_band  numeric(3,1),                        -- IELTS per-band
  intakes           text[] not null default '{}',        -- e.g. ['feb','jul']
  source            text,
  last_verified     date,
  data_quality      text not null default 'derived' check (data_quality in ('primary','derived','secondary')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index programs_university_id_idx on public.programs (university_id);
create index programs_field_idx          on public.programs (field);
create index programs_level_idx          on public.programs (level);
create trigger programs_set_updated_at
  before update on public.programs for each row execute function private.set_updated_at();

-- user_program_state
create table public.user_program_state (
  owner       uuid not null references auth.users(id) on delete cascade,
  program_id  text not null references public.programs(id) on delete cascade,
  status      text not null check (status in ('shortlisted','applied','withdrawn')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (owner, program_id)
);
create index user_program_state_owner_idx on public.user_program_state (owner);
create trigger user_program_state_set_updated_at
  before update on public.user_program_state for each row execute function private.set_updated_at();

-- RLS
alter table public.universities      enable row level security;
alter table public.universities      force  row level security;
alter table public.programs          enable row level security;
alter table public.programs          force  row level security;
alter table public.user_program_state enable row level security;
alter table public.user_program_state force  row level security;

-- public reads (universities + programs) for any authenticated user
create policy universities_read on public.universities for select to authenticated using (true);
create policy programs_read     on public.programs     for select to authenticated using (true);

-- user_program_state owner-scoped CRUD
create policy ups_select_own on public.user_program_state
  for select to authenticated using ((select auth.uid()) = owner);
create policy ups_insert_own on public.user_program_state
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy ups_update_own on public.user_program_state
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy ups_delete_own on public.user_program_state
  for delete to authenticated using ((select auth.uid()) = owner);

-- writes to universities/programs only via service role (no policies needed; RLS denies by default)
revoke all on public.universities      from anon, authenticated;
revoke all on public.programs          from anon, authenticated;
revoke all on public.user_program_state from anon, authenticated;
grant select               on public.universities      to authenticated;
grant select               on public.programs          to authenticated;
grant select, insert, update, delete on public.user_program_state to authenticated;
```

## 4. Modules

```
lib/programs/
├── repo.ts           listAllPrograms, listProgramsForField, listProgramsForUniversity, getProgram
├── seed.ts           pure: SEED = { universities, programs } — used by migration insert
├── policy.ts         current cohort policy constants (AssessmentLevel.NEPAL_L3, dhaLivingCosts, etc.)
└── types.ts          University, Program, ProgramLevel

lib/matches/
├── compute.ts        pure: computeMatches(profile, programs, policy) → MatchResult[]
├── repo.ts           upsertProgramState, listShortlistForUser
└── types.ts          MatchResult, MatchVerdict, MatchReason

lib/scoring/
└── multi-destination.ts   (new) — composeScoresForAllDestinations(profile, programs)

lib/matching/
└── universities.ts        DELETED — superseded by lib/matches/
```

## 5. Match algorithm

For each program:
- `gradeGap = max(0, min_grade - userGrade)` (user grade converted via existing engine)
- `englishGap = max(0, min_english - userOverall)`
- `bandGap = userOverall < min_english_band ? min_english_band - userOverall : 0`
- `tuitionGap = max(0, tuition_min - userBudgetUSD)`

Verdict:
- **Strong** if `gradeGap === 0 && englishGap === 0 && bandGap === 0 && tuitionGap === 0`
- **Reach** if `gradeGap > 10 || englishGap > 1 || tuitionGap / tuition_min > 0.5`
- **Possible** otherwise

Reasons surfaced per program: short strings (`"Grade meets minimum"`, `"IELTS overall 7 ≥ 6.5"`, `"Budget below tuition by AUD 8,000"`, `"Genuine Student narrative needed"` if Nepal L3 applies, etc.).

The user's grade is converted using the research's Nepal TU → Australian WAM table (in `lib/programs/policy.ts`).

## 6. Pages + API

- `/matches` (Universities tab) — server component, fetches programs + user profile + shortlist, calls `computeMatches`, groups by verdict, renders `<ProgramCard>` per program with verdict pill + reasons + shortlist toggle. Scholarships and Cost estimate tabs render "Coming soon" panels.
- `/api/shortlist` (POST) — body `{ programId, status: "shortlisted" | "applied" | "withdrawn" | null }` — null deletes the row. Auth-gated.
- `/api/matches` — Not strictly needed; the page fetches server-side. **Out of scope.**

## 7. Components

```
components/matches/
├── matches-tabs.tsx       client; tab switcher
├── program-card.tsx       server; renders verdict pill, university+program, tuition, requirements, reasons, ShortlistButton
├── shortlist-button.tsx   client; calls /api/shortlist
├── verdict-group.tsx      server; "Strong matches (4)" group header + program cards
└── policy-banner.tsx      server; surfaces Nepal L3 + DHA AUD 29,710 figures with source links
```

## 8. Tests

- Pure scoring + match: 100% covered (every branch of the algorithm + every gap shape).
- Repo: faked supabase per existing pattern.
- API: mocked auth + repo.
- Components: RTL.
- Page: RTL with mocked repos and computeMatches.

## 9. Acceptance

- Migration applied + Supabase advisor pass.
- 60+ programs seeded across 15 universities, including all Tier 1 Go8 + RMIT (the one university with explicit Nepal thresholds).
- `/matches` renders for a signed-in user with a profile.
- Shortlisting persists and is visible on dashboard StatsRow ("Universities" stat now points to shortlist count instead of `matchedCount`).
- Existing flow regression-clean: anonymous wizard, claim, owned results, /dashboard all still work.
- Tests + typecheck + lint + build clean.

## 10. Out of scope (still)

- Scholarships data (Phase 4).
- Cost estimate calculator UI (Phase 4).
- Multi-destination "Compare destinations" view (uses `multi-destination.ts` but exposed in a later phase).
- Per-program checklist (Phase 5).
- Document uploads (Phase 5).
