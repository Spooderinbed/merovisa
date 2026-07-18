# MV-137 — Umbrella: security + reliability hardening (audit F-15/F-16/O-3/O-4/O-5/O-6)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_
**Umbrella — do NOT build from this directly.** Split a real, scoped card off when a slice
starts. Tracked here so the audit's security/reliability half stops living only in the
report file.
**Source:** 2026-07-10 audit, confirmed uncarded 2026-07-17.

## Why

These are the "before launch" engineering risks the audit raised. None is student-visible
today, but each is a production liability. They are grouped because they share an owner and
a review pass, not because they ship together.

## Contents (each becomes its own card when picked up)

- **F-15 — no production error monitoring.** Sentry is referenced but not wired; a prod
  error is invisible. (MV-62 added in-app error *boundaries*, not external monitoring.)
- **F-16 — security cluster.** No CSP; rate-limiter is fail-OPEN (an outage disables the
  limit); a sign-claim HMAC verification oracle; `select(*)` over-fetch. **Split F-16 into
  at least: CSP, fail-open→fail-closed rate limit, the HMAC oracle, column-scoped selects.**
  The HMAC oracle + fail-open limiter are the sharpest — consider pulling them out first.
- **O-3 — non-transactional multi-step flows.** Claim / bootstrap / primary / lead / apply
  run as separate writes with no transaction; a mid-sequence failure leaves partial state.
- **O-4 — profile lost updates.** Profile JSON is read → merged → overwritten, so concurrent
  edits clobber each other.
- **O-5 (residual) — CI is advisory.** Integration job is `continue-on-error` and there is
  no browser E2E gate. MV-19/81 wired the job; it still cannot block a merge. (See
  [[integration-ci-secrets-gap]] — also note today's failure was a Docker port collision,
  not the secrets bail.)
- **O-6 — build-time fragility.** Marketing static-bailout catch masks failures; Google
  Fonts is a build-time network dependency.

## How to work this

Pick the highest-risk item, write a dedicated card with a real repro + fix + test, build it
TDD, close it, and check the box here. Do not attempt the whole umbrella as one PR.

- [ ] F-15 monitoring
- [ ] F-16 CSP · [ ] F-16 fail-closed rate limit · [ ] F-16 HMAC oracle · [ ] F-16 scoped selects
- [ ] O-3 transactional flows
- [ ] O-4 profile concurrent-edit safety
- [ ] O-5 required CI gate + E2E
- [ ] O-6 build-time robustness

## Resume notes

- These are agent-buildable but need prioritisation against the student-facing gaps
  (MV-129–133) and the trust P0s (MV-134/135). The P0s and correctness gaps come first;
  this umbrella is the "before real launch" tier.
