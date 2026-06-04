# Phase 4: Plan generator + ranked actions — design spec

**Date:** 2026-06-04
**Status:** Retroactive — shipped without a checked-in spec. This document records decisions as implemented.
**Commits:** `268eab5`, `6b509c1`, `b53c24e` (June 2026).
**Extends:** Phase 3 (programs + matches).

---

## 1. Problem

After Phase 3 a user sees a verdict (Strong / Possible / Reach) for each program but has no concrete guidance on what to do next. The gap between "you are a Possible for 6 programs" and an actionable to-do list is exactly where trust is lost — the user bounces to a consultancy that tells them the same things we could have told them for free.

A ranked, impact-aware action list closes that loop. It surfaces the highest-leverage thing the user can do right now, derived from their profile + match landscape, and it refreshes automatically as their profile changes.

---

## 2. Goals

1. Surface 1–11 ranked next steps tailored to the user's profile completeness, English and academic scores, finance situation, study gap, and match landscape.
2. Refresh automatically whenever the user changes their profile, submits or reclaims an assessment, or uploads or deletes a document (cascade via `invalidatePlan`).
3. Let users mark items done or dismiss them. Closed items never block the generator from re-emitting the same kind — a partial unique index on open items prevents duplicate active entries without blocking regeneration after the user's situation improves.
4. Items are human-authored copy, not AI-generated, so every word is reviewable and defensible.

---

## 3. Non-goals

- **AI-generated copy.** Rule titles and bodies are hand-written for each `kind`. There is no LLM in the generation path.
- **Deadlines.** No due-date fields in this phase. Deadline awareness is Phase 6+.
- **Per-program checklists.** Per-program action items (application checklist, document checklist) are Phase 5+. The plan is profile-level, not program-level.
- **Notifications or reminders.** Plan is surfaced on the `/plan` page only. Push/email nudges are post-MVP.
- **Scholarships data.** Mentioned in the marketing spec as a Phase 4 item; ultimately deferred. The plan generator covers visa-case and admissions strength only.

---

## 4. Decisions (locked)

1. **Impact tiers are `high | medium | low`.** High items affect visa case or match scoring directly (grade, English score, funds, gap evidence, L3 policy). Medium items sharpen accuracy or narrative strength. Low items are profile hygiene. The page groups items by tier; within a tier, newest first.

2. **Rules are pure TypeScript functions with no external calls.** `generatePlan(inputs: GeneratorInputs): PlanItem[]` is a synchronous pure function. It reads profile sections, match results, policy constants, and destination context. No DB calls, no network calls.

3. **Rule versioning is implicit in code.** There is no numeric version field on `plan_items`. When rules change, re-running `invalidatePlan` emits new items alongside any existing open items — old kinds are not deleted (the user may have marked them done). Explicit versioning (e.g. a `rule_version` column) is deferred.

4. **Cascade is best-effort.** Every call site wraps `invalidatePlan` in `try/catch` with a `console.error` log. The plan invalidation never blocks the parent operation (profile save, assessment insert, document upload/delete). If the cascade fails, the user's primary action still succeeds.

5. **Partial unique index prevents duplicate open items.** `create unique index plan_items_kind_open_idx on public.plan_items (owner, kind) where status = 'todo'` ensures at most one open (todo) item per kind per user. Done and dismissed items are excluded from the index, so a `done` item for `add-grade` can coexist with a newly-generated `todo` item of the same kind (e.g. after the user cleared then re-entered their grade).

6. **De-duplication is application-level, not conflict-resolution.** Rather than relying on `ON CONFLICT DO NOTHING` (which PostgREST does not support against partial indexes), `invalidatePlan` reads the user's open kinds first, filters them out, and inserts only net-new items. The partial unique index is a safety net, not the primary guard.

7. **INSERT and DELETE are service-role only.** Authenticated users have SELECT + UPDATE on `plan_items`. The generator inserts rows via the admin client. The user updates `status` via the action endpoint, which calls `setPlanItemStatus` with an `eq("owner", userId)` predicate to prevent cross-user writes.

8. **Action endpoint accepts `todo` in the schema.** The Zod body schema for `POST /api/plan/action` accepts `{ id: number; status: "todo" | "done" | "dismissed" }`. This lets the client implement an "Undo" path (marking a done or dismissed item back to todo) without a separate endpoint.

9. **Page fetches all items (including closed), client filters.** `listAllPlanForUser` returns all statuses. `PlanList` separates open from closed client-side: open items group by impact tier; closed items collapse into a `<details>` at the bottom. This avoids a flash of missing content if the user undoes a closed item.

10. **Generator produces at most 11 items** (one per rule). In practice most users see 3–7, depending on profile completeness. There is no explicit cap — the rule list is the cap.

---

## 5. Data model

Migration: `supabase/migrations/20260604024609_add_plan_items.sql`

```sql
create table public.plan_items (
  id              bigint generated always as identity primary key,
  owner           uuid not null references auth.users(id) on delete cascade,
  kind            text not null,
  impact          text not null check (impact in ('high','medium','low')),
  title           text not null,
  body            text,
  lift_estimate   text,
  time_estimate   text,
  status          text not null default 'todo' check (status in ('todo','done','dismissed')),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
```

**Indexes:**

| Index | Type | Predicate |
|---|---|---|
| `plan_items_owner_idx` | btree `(owner)` | — (all rows) |
| `plan_items_open_idx` | btree `(owner, created_at desc)` | `where status = 'todo'` |
| `plan_items_kind_open_idx` | unique btree `(owner, kind)` | `where status = 'todo'` |

**Row-level security:**

```sql
-- SELECT by owner
create policy plan_items_select_own on public.plan_items
  for select to authenticated using ((select auth.uid()) = owner);

-- UPDATE by owner (status changes via action endpoint)
create policy plan_items_update_own on public.plan_items
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

-- INSERT + DELETE via service role only
revoke all on public.plan_items from anon, authenticated;
grant select, update on public.plan_items to authenticated;
```

**TypeScript types** (`lib/plan/types.ts`):

- `PlanItem` — the generator's output shape (no `id`, no `owner`, no `status`). Fields: `kind`, `impact`, `title`, `body`, `liftEstimate?`, `timeEstimate?`.
- `PlanItemRow` — the DB row mapped to camelCase. Adds `id`, `owner`, `status`, `createdAt`, `completedAt`.
- `Impact = "high" | "medium" | "low"`
- `PlanStatus = "todo" | "done" | "dismissed"`

---

## 6. Generator rules

All 11 rules in `lib/plan/generator.ts` at time of shipping, listed in evaluation order:

| # | `kind` | Trigger condition | Impact | Title |
|---|---|---|---|---|
| 1 | `set-name` | `sections.personal?.name` is falsy | low | "Add your name" |
| 2 | `add-grade` | `sections.academic?.gradePercent` is falsy | high | "Add your academic grade" |
| 3 | `add-english-score` | `sections.english?.overall == null` | high | "Add your IELTS overall score" |
| 4 | `upload-ielts-report` | English overall exists **and** `sections.english.reportUploaded === false` | medium | "Upload your IELTS report" |
| 5 | `upload-proof-of-funds` | `!sections.finance?.proofUploaded` | high | "Add proof of funds" |
| 6 | `document-gap-reasons` | `sections.gap?.years >= 1` and `sections.gap.reasons` is empty | medium | "Document your study gap reasons" |
| 7 | `document-gap-evidence` | `sections.gap?.years >= 1` and `sections.gap.evidence` is empty | high | "Add evidence for your study gap" |
| 8 | `season-funds-six-months` | `policy.nepalAssessmentLevel === "L3"` | high | "Season your bank statements for 6 months" |
| 9 | `add-work-docs` | `sections.work?.title` exists **and** `!sections.work.docs` | medium | "Get an employment letter on company letterhead" |
| 10 | `set-intended-field` | `!sections["intended-study"]?.field` | medium | "Set your intended field of study" |
| 11 | `add-safer-options` | Has a primary destination **and** all matches are reach **and** no strong matches | medium | "Add safer university options" |

**Lift estimate notes:**

- Rule 4 (`upload-ielts-report`): `liftEstimate` is dynamic — `"Could re-classify ${possibleCount} possible matches as strong"` if `possibleCount > 0`, otherwise `"Sharpens band-aware verdicts"`.
- Rule 11 (`add-safer-options`): `body` embeds the reach count dynamically.
- Rule 8 (`season-funds-six-months`): always emitted when policy is L3, regardless of whether funds proof is already uploaded (seasoning is a separate concern from proof existence).

**Generator inputs** (`GeneratorInputs`):

```ts
interface GeneratorInputs {
  sections: ProfileSections;
  primaryDestinationId: string | null;
  matches: MatchResult[];
  policy: { nepalAssessmentLevel: "L2" | "L3" };
}
```

---

## 7. The cascade — `invalidatePlan`

`lib/plan/invalidate.ts` — `invalidatePlan(adminDb, userId)`:

**Steps:**

1. **Parallel reads:** `getProfile`, `getPrimaryAssessmentForUser`, `listAllPrograms`, `listAllUniversities` — all four in a single `Promise.all`.
2. **Build match inputs:** `sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL })`.
3. **Compute matches:** `computeMatches(matchInputs, programs, universities)` — same pure function used by the `/matches` page.
4. **Run generator:** `generatePlan({ sections, primaryDestinationId, matches, policy })` → `PlanItem[]`.
5. **Early exit** if generator returned 0 items.
6. **Read open kinds:** `select kind from plan_items where owner = userId and status = 'todo'`.
7. **Filter:** exclude any item whose `kind` is already open.
8. **Insert** net-new rows with `status = 'todo'`.

**Trigger sites** (all wrap in `try/catch` with `console.error`):

| File | Event | Error label |
|---|---|---|
| `app/api/profile/section/route.ts` | After successful profile section save | `[profile/section] invalidatePlan failed` |
| `app/api/assess/route.ts` | Signed-in path, after assessment insert | (logged inline) |
| `app/api/documents/upload/route.ts` | After boolean `reportUploaded` / `proofUploaded` flag flip | `[documents/upload] invalidatePlan failed` |
| `app/api/documents/[id]/route.ts` | After document delete (flag reversal) | `[documents/delete] invalidatePlan failed` |

None of these sites `await` the invalidation from within a response-blocking context — if `invalidatePlan` throws, the parent handler catches and continues.

---

## 8. API routes

### `POST /api/plan/action`

**File:** `app/api/plan/action/route.ts`

**Auth:** Required. Returns 401 if no session.

**Request body** (Zod-validated):
```ts
{
  id: number;    // plan_items.id (positive integer)
  status: "todo" | "done" | "dismissed";
}
```

**Logic:**
1. Parse + validate body.
2. Get session user via `supabase.auth.getUser()`.
3. Call `setPlanItemStatus(adminDb, user.id, id, status)` — the `eq("owner", owner)` predicate inside `repo.ts` ensures the row must belong to the calling user.
4. If `status === "done"`, sets `completed_at = now()`; otherwise clears it.

**Responses:**
- `200 { ok: true }` on success
- `400` on invalid JSON
- `401` if unauthenticated
- `422` on schema validation failure
- `500 { ok: false }` if the DB update fails

---

## 9. UI

### `/plan` page (`app/(app)/plan/page.tsx`)

Server component. Redirects unauthenticated users to `/auth?next=/plan`.

Fetches all plan items for the user (`listAllPlanForUser`) and renders `<PlanList items={items} />`.

Page header copy: "The shortest path to a stronger application." / "Ranked by impact on your verdict + visa case. We regenerate this whenever your profile changes."

### `PlanList` (`components/plan/plan-list.tsx`)

- Separates items into open (status `todo`) and closed (`done` | `dismissed`).
- Groups open items into three sections: **High impact**, **Medium impact**, **Low impact** — each rendered only when non-empty.
- Renders closed items inside a `<details>` disclosure at the bottom.
- **Empty state** (no items at all): card with "All caught up" heading and body "When you change your profile or rerun your assessment, new actions land here."

### `PlanItemCard` (`components/plan/plan-item-card.tsx`)

Client component (`"use client"`).

- Shows `<ImpactPill impact={item.impact} />`, title, body, lift estimate (prefixed with ↑), time estimate (prefixed with ⌛).
- Open items: **Done** button (teal pill) + **Dismiss** button (ghost pill). Both call `POST /api/plan/action` optimistically and update local state.
- Closed items: **Undo** button — sets status back to `todo`.
- Done title gets `line-through` styling. Closed cards reduce opacity to 70%.

---

## 10. Testing

### Unit tests — generator rules

One test per rule: provide a `GeneratorInputs` where exactly that rule's trigger is true, assert one `PlanItem` with the correct `kind` and `impact`. Also: provide a complete profile + no-gap inputs and assert `generatePlan` returns an empty array (or only the L3 policy item if applicable).

### Integration test — cascade

`tests/plan/invalidate.test.ts`: fakes the admin DB client (mock supabase pattern), asserts that after a call to `invalidatePlan` the `insert` method is called with the expected rows. Covers the case where some kinds are already open (filter step).

### API route test — ownership

`tests/api/assess-persist.test.ts` + `tests/api/profile-section.test.ts`: mock `invalidatePlan` to a `vi.fn()` and verify it is called after a successful profile/assess save, and not called on auth or validation failure.

Plan action endpoint test: mock `setPlanItemStatus`, verify it is called with the correct `owner`, verify 401 is returned for an unauthenticated request.

### Component test — impact grouping

`tests/components/plan/plan-list.test.tsx`: render `<PlanList>` with mixed-impact items, assert that the three group headings appear only for non-empty tiers.

---

## 11. Rollout

**Shipped at:** commits `268eab5`, `6b509c1`, `b53c24e` (June 2026).

**Migration:** `20260604024609_add_plan_items.sql` applied. Table, indexes, and RLS policies live.

**Rules live:** All 11 rules described in §6 are active.

**Post-ship notes (June 5, 2026):** A pre-MVP code review pass tightened error logging at cascade call sites and updated `invalidatePlan` to also trigger a re-score of the primary assessment (`reScoreAssessment`) so match verdicts stay in sync after profile edits. That change is tracked under the pre-MVP remediation commits; the spec above reflects the June 4 baseline.

**Dependency:** Phase 4 depends on Phase 3 (programs + `computeMatches` must exist). Phase 5 (per-program checklist) and Phase 4 are parallel — neither depends on the other.

---

## 12. Out of scope

- Scholarships data (noted in marketing spec as Phase 4; deferred to a later phase).
- Cost estimate calculator UI (deferred).
- Notification / reminder delivery for plan items.
- Per-program action checklists (Phase 5).
- Deadline tracking on plan items (Phase 6+).
- AI-generated or personalised copy per user.
