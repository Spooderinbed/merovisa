# MV-133 — A DB read error renders as "no programs," not an outage (audit §7 #18)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_
**Source:** 2026-07-10 audit, the unlabelled "false empty-state repositories" finding
(§7 item #18), confirmed uncarded 2026-07-17. Read-side sibling of MV-02, which fixed only
the WRITE-side swallow (`ok:true` on failure).

## Why (student outcome)

If the programs query fails, the student is told "no programs found" — a confident false
negative. They conclude the product has nothing for them (or is empty) and leave, when the
truth is a transient outage. The single most demoralising possible answer, shown for the
wrong reason.

## The bug

`lib/programs/repo.ts` returns `[]` on any error at four call sites (lines ~10, 16, 22, 38:
`if (error || !data) return [];`). A DB/network error is indistinguishable from a genuinely
empty result. Downstream, the matches/results surfaces render the empty state.

## Fix direction

Distinguish "queried successfully, nothing matched" from "the query failed." On a real
error, propagate it so the surface can show an honest outage/retry state (reuse the MV-62
error boundary) instead of the empty state. Do NOT throw blindly everywhere — audit each of
the four sites; some callers may legitimately tolerate empty.

## Acceptance criteria

- [ ] A read error no longer renders as an empty result; it surfaces an honest error/retry
      state.
- [ ] A genuinely empty result still renders the calm empty state.
- [ ] The two are distinguishable in the return type (not both `[]`).
- [ ] Gate green; cover with a test that mocks a repo error and asserts the error state, not
      the empty state.

## Resume notes

- Path + lines verified 2026-07-17: `lib/programs/repo.ts`, `return []` at 4 sites.
- MV-02 fixed the write-side (`ok:true`-on-failure) swallow; this is the read side.
- MV-62 shipped the error/loading boundaries to render into.
