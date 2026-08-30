# MV-201 — Stage 5's team-invitation half is unbuilt

Found 2026-08-29 while confirming Stage 5's exit gate before closing the stage.

Stage 5 has **two** invitation types, and the plan says so in two places. From
`docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`:

> There are two invitation types:
> - a **team invitation** that creates an organization membership; and
> - a **student invitation** that links an Auth account to an existing case.

and the stage's own bullets:

> - implement **team and student** invitation acceptance;
>
> **Exit gate:** both existing and new users can accept a valid invitation, while
> replay, mismatch, expiry, and revocation tests pass.

**Slices 1–4 (MV-193, MV-194, MV-195, MV-196) are all the student half.** The team
half has no route at all.

## Measured, not assumed

- `POST /api/cases/[caseId]/invitations` — student mint (MV-193). Case-scoped.
- `POST /api/invitations/accept` — student accept (MV-194). Its doc comment names
  itself "accepting a student invitation"; it calls `linkCaseToStudent` and nothing
  else.
- `app/api/org/[organizationId]/members/[membershipId]/route.ts` — mutates an
  **existing** membership. It does not create one from an invitation.
- **There is no org-scoped invitation mint route**, and nothing anywhere inserts an
  `organization_memberships` row from an invitation.

The schema is already ready for it. `public.invitations` (Stage 1) carries both
shapes and enforces their exclusivity:

```sql
constraint invitations_shape_check check (
  (organization_id is not null and case_id is null and role <> 'student')
  or (case_id is not null and role = 'student')
)
```

## The student path is safe — and that is why this needs its own route

`redeemInvitationToken` scopes the compare-and-swap with
`.eq("role", STUDENT_INVITATION_ROLE)`, and its diagnosis path returns
`invalid-token` for a team token rather than burning it. Its own comment says why:

> a TEAM invitation is a different authority and a different blast [radius] … so the
> student path cannot redeem a counsellor's token.

So there is **no live defect here** — a team token cannot be mis-redeemed, it simply
has nowhere to go. The fix is a second route with its own authority, **not** a
widened predicate on the student one. Widening it would be the defect this scoping
was written to prevent.

## The founder decision this actually needs

Stage 7's exit gate says consultancies are onboarded **manually** for the pilot:

> onboard a small consultancy cohort manually

If memberships are hand-created for the pilot, team invitations are **not
pilot-blocking**, and Stage 5 could close with this half explicitly deferred rather
than silently missing. That is the call to make — the risk being recorded here is
not the missing feature, it is **closing a stage against an exit gate that names
something nobody built**.

Two honest options:

1. **Build it** — an org-scoped mint plus a team-acceptance route that creates the
   membership, reusing MV-193/194's proven shape (hash-only storage, atomic
   compare-and-swap, verified-email binding, rate limiting, audit event).
2. **Defer it deliberately** — amend the Stage 5 exit gate to the student half,
   record the deferral, and keep manual membership creation as the pilot path.

Do **not** close Stage 5 without picking one.

## If it is built — sketch of acceptance criteria

1. An org-scoped mint authorized to owner/admin only, refusing `role = 'student'`.
2. A team-acceptance route that creates the membership in one atomic
   compare-and-swap, with the affected row count as the authorization — the same
   property MV-194's route rests on.
3. Verified-email binding, normalized address matching, rate limiting, and an audit
   event, matching MV-193/194.
4. Resend does not create duplicate memberships (the plan names this case).
5. The student route still refuses a team token: a regression test pins
   `.eq("role", …)` so the two authorities cannot merge later.
6. Replay, mismatch, expiry, and revocation tests — the exit gate's own words.
