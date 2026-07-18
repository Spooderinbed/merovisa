# MV-135 — Anonymous assessments have no purge/deletion path (audit O-2)

**Priority:** P1 · **Owner:** agent + founder · **Merge:** _founder-gated_ (data-retention policy)
**Source:** 2026-07-10 audit finding **O-2**; the audit explicitly said "card O-1/O-2 as
blockers." O-1 rides MV-08; **O-2 had no card** until now (confirmed 2026-07-17). A data
liability, not a UX nicety.

## Why

The 3-day "expiry" is an *access* expiry, not deletion — the anonymous assessment data
persists. There is no purge job and an anonymous user has no way to delete their data.
That is a standing privacy/retention liability, and it undercuts the trust the product
sells. It pairs with MV-05 (legal/disclaimer) but is a distinct mechanism: MV-05 is the
account-deletion path + retention *policy text*; this is the actual anonymous-data purge.

## The gap

- No cron/scheduled purge of expired anonymous assessments.
- No self-serve deletion for an anonymous user.
- Retention is therefore unbounded and undisclosed for the anonymous path.

## Fix direction (needs a founder retention decision first)

1. **Founder decides the retention window** for anonymous data (how long after the 3-day
   access expiry, if not immediately).
2. Implement a purge job honouring that window (Supabase scheduled function / external cron
   — note business logic stays in the app per CLAUDE.md; the cron just triggers it).
3. Give the anonymous user a delete affordance, or clearly disclose the retention + purge in
   the privacy copy (ties to MV-05).

## Acceptance criteria

- [ ] Expired anonymous assessments are purged on a defined, disclosed schedule.
- [ ] The retention window is a founder-approved, written policy (link it).
- [ ] Privacy copy tells the truth about retention + deletion.
- [ ] Gate green; cover the purge logic with a test.

## Resume notes

- **Blocked on a founder retention-window decision** — do not guess it.
- Related: MV-05 (legal/data boundary, blocked on 4 founder facts), MV-08 (outcome loop /
  O-1 prediction snapshot). Keep this distinct from both.
