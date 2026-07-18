# MV-131 — Guide: citation contract not enforced, "remembers you" is false, chats vanish (audit C-12)

**Priority:** P2 · **Owner:** agent · **Merge:** _founder-gated_ (trust copy + a product call)
**Source:** 2026-07-10 audit finding **C-12**, confirmed uncarded 2026-07-17. Distinct from
MV-78 (timeout) / MV-79 (anti-injection) — those harden the call, not the grounding contract.

## Why (student outcome)

The guide is a trust surface. Three gaps undercut it:
1. **Grounding is a prompt promise, not an enforced contract.** The system prompt asks the
   model to cite, but nothing validates that answers are actually grounded in the sourced
   corpus. A confident ungrounded answer looks identical to a grounded one.
2. **"Remembers you" is false.** The guide presents as personalised/continuous but does not
   persist across sessions.
3. **Chats vanish on refresh.** `components/guide/guide-chat.tsx` holds messages in
   component state only, so a reload loses the conversation.

## Split before building — these are three different sizes

- **Copy honesty (small, do first):** stop implying memory/continuity the product does not
  have. Founder owns the wording.
- **Chat persistence (medium):** persist the thread (localStorage at minimum, or per-user
  server-side) so a refresh does not wipe it. Real feature, real scope.
- **Citation contract (large, product call):** enforce or visibly caveat grounding. This is
  the audit's headline and the biggest piece — may deserve its own follow-up card once the
  first two land.

Default: land copy honesty + persistence; treat the enforced citation contract as a scoped
follow-up, not a silent expansion.

## Acceptance criteria

- [ ] The guide no longer claims memory/continuity it lacks (founder-approved wording).
- [ ] A refresh no longer discards the visible conversation.
- [ ] A plan for the grounding contract is written (enforce vs. caveat), even if the build is
      a follow-up.
- [ ] Gate green; guide is auth-gated + 503 without a key, so cover via RTL + a live pass.

## Resume notes

- Path verified 2026-07-17: `components/guide/guide-chat.tsx` (client component, in-memory
  message state).
- The guide is LIVE in prod (DEEPSEEK key set) per [[2026-07-02-guide-live-and-freshness-timer]].
