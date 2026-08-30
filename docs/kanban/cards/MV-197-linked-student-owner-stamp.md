# MV-197 — a linked student's account deletion destroys the consultancy's data

**Found by an external Codex review of MV-196 (2026-08-29), then verified here against source
and schema.** It is NOT a defect in MV-196's commit. It is the *same root cause* as MV-196's
headline finding, in a second place: a helper written when "linked student" could only mean a
student on a case they owned, which MV-194 silently reinterpreted.

MV-196 closed the student's **write** boundary. This is the **delete** boundary, and it runs
through a service-role route where RLS can never be the backstop.

---

## The defect

`caseWriteColumns()` ([lib/cases/dual-write.ts:92](../../../lib/cases/dual-write.ts)) derives the
`owner` column from `cases.student_user_id` **without looking at `organization_id`**:

```ts
const row = data as { id: string; student_user_id: string | null };
return { caseId: row.id, owner: row.student_user_id ?? null };
```

Before MV-194 nothing could set `student_user_id` on an org-owned case, so this always returned
`owner: null` for a consultancy case — which is the **designed** shape, stated at the top of that
same file: *"Consultancy-created rows carry `case_id` with `owner` NULL, which MV-156's `drop not
null` is what made possible."*

After MV-194, an accepted invitation sets `student_user_id` on an **org-owned** case. Every writer
that goes through this helper — `lib/profiles/repo.ts`, `lib/plan/invalidate.ts`,
`lib/matches/repo.ts`, `lib/documents/repo.ts`, `lib/documents/status-repo.ts`,
`lib/outcomes/repo.ts` (×3), `lib/cases/residue.ts`, and
`app/api/cases/[caseId]/assess/route.ts` — now stamps the **linked student's user id** as `owner`
on rows belonging to the **consultancy's** case. Staff doing ordinary case work produce them.

Then `/api/account/delete` destroys exactly those rows, by **two independent mechanisms**:

1. **Step 2 deletes by bare `owner`.** `app/api/account/delete/route.ts:100-103` loops the nine
   owned tables with `.delete().eq("owner", userId)` — no case filter at all. Step 1 (`:86-97`)
   likewise lists `documents.file_path where owner = userId` and removes those **Storage objects**.
   Step 3 correctly excludes org cases (`.is("organization_id", null)`), so the `cases` row
   survives — orphaned, with its children and files gone.

2. **Step 4's cascade would do it anyway.** Every `owner` FK is
   `references auth.users(id) on delete cascade` (verified across the original table migrations),
   so `admin.auth.admin.deleteUser(userId)` at `:142` removes every remaining row carrying that
   owner regardless of what step 2 skipped. **Fixing only the step-2 predicate does not close
   this** — that is the half the review missed.

### It contradicts a requirement the repo states three times

- Route doc comment, `:27-31`: *"A consultancy case belongs to the organisation, not to the
  student, and must survive the student closing their MeroVisa account."*
- `lib/supabase/service-role-exceptions.ts:203`: *"must NOT touch a consultancy case that also
  holds their data (plan line 514)."*
- `tests/architecture/no-actor-equals-student.test.ts:128` repeats it in the allowlist.

So this is a **bug against stated intent**, not a product question.

### Live exposure today

Reachable on `master` now (MV-194/195 are merged), but impact is currently **zero**: the
consultancy version has no customers, so no org case has staff-written child rows. It fires on
the **first pilot tenant**. Fix before Stage 7.

---

## The fix, and the trap in it

**Preferred shape — make the helper case-aware, and the delete route needs no change at all.**
If `caseWriteColumns` returns `owner: null` whenever `organization_id is not null`, then no org
row ever carries a departing user's id, so neither the step-2 predicate nor the step-4 cascade can
reach it. That restores the shape the rest of the system already assumes.

**Do not reflexively null `owner` on existing `assessments` rows.** MV-135's purge
([lib/assessments/purge.ts:89-96](../../../lib/assessments/purge.ts)) keys on
`owner is null AND expires_at < now AND created_at < cutoff` and does **not** check `case_id`.
Consultancy assessments are safe today only because `app/api/cases/[caseId]/assess/route.ts:85`
writes a `FAR_FUTURE` expiry *precisely for this reason* (its comment says so). Any backfill must
preserve that invariant per-table rather than blanket-nulling.

Also check `caseBindColumns` (narrows `owner` to non-null, used by the claim path) — decide
explicitly whether an assessment may be claimed onto an org case.

## Acceptance criteria

1. **Red first.** An integration probe that seeds an org case with an accepted student link, has
   *staff* write child rows through a real repo path, then runs the account-delete sequence and
   asserts the consultancy's rows **and Storage objects** survive. Must fail before the fix.
2. A separate probe covering the **cascade** specifically: delete the Auth user directly and
   assert org-case rows survive. This is the one a step-2-only fix would pass.
3. `caseWriteColumns` never returns a non-null `owner` for a case with `organization_id` set —
   unit-pinned, plus the existing `tests/cases/dual-write.test.ts` ORG_CASE case extended.
4. A backfill migration nulling `owner` on org-case rows, table by table, with the purge invariant
   argued per table in the migration body.
5. Gate green: `typecheck` / `lint` / `test` / `test:integration`, read from the raw log.
6. Migration owed to the **production ledger** on merge (master auto-deploys; migrations do not).

## Resume notes

- Verified during MV-196's review: the 18 write policies, the `owner` FK cascade, the nullable
  `owner` columns (`20260803120000_stage2_owner_nullable_case_fk_rebase.sql:315-322`), and the
  purge predicate. None of that needs re-deriving.
- The `no-actor-equals-student.test.ts` arch guard allowlists `dual-write.ts` as the single
  `owner`-deriving path — so changing it there is the sanctioned place, and no allowlist edit
  should be needed.
