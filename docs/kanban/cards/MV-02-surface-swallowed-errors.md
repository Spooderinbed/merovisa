# MV-02 — Surface swallowed errors (no `ok:true` on failed mutations)

**Priority:** P2   **Owner:** agent
**Goal:** A failed re-score / plan / profile mutation never reports success — the user
sees the failure and the server logs it. (In a trust-first product, a silent write
failure is itself a trust bug.)

## Context links
- Round-1 audit Q16 (`ok:true` on failure): `docs/audits/2026-06-18-full-app-evaluation.md`
- Forward plan §3.4 (observability / silent failures) + §4 (no silent failures): `.claude/plans/tender-bouncing-locket.md`
- Service-role write paths: `app/api/**/route.ts` (profile, plan, documents), `lib/**` repos they call.

## Acceptance criteria
- [x] Every mutation route returns a real error status/body when the underlying write fails (no unconditional `{ ok: true }`). — **DONE** (4 confirmed swallows fixed: profile/section, documents/[id] DELETE, documents/upload, assess signed-in insert; the other 5 mutation routes were already correct — verified by a 13-agent audit workflow, 0 false positives).
- [x] Failures are logged with structured context (error code, affected id, correlation id where available). — **DONE** (every fixed path `console.error`s with `{ userId/owner, id/kind/section, err }`; added a log to the previously-bare `leads` catch; logged the by-design anon-assessment + profile-bootstrap misses too).
- [x] The client surfaces the failure to the user (not a false success toast). — **DONE** (the honest clients already key off `res.ok` — `section-save`, `document-card.handleUpload`, `assess-flow`; the one gap, `document-card.handleDelete`, now guards on `res.ok` before clearing the card).

## Test plan
- For each affected route: a test where the repo/DB call rejects → assert the route returns an error (not `ok:true`) and logs it.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- None.

## Risk notes
- Touches multiple API routes — keep changes surgical and consistent; don't over-engineer a logging framework (use what's already wired: Sentry).

## Agent resume notes (cold start)
1. Grep the API routes for `ok: true` / `return NextResponse.json({ ok` and trace which ones swallow a thrown/failed write.
2. Start with re-score, plan, profile (named in the audit). Add the failing-path test first.

## Decision log
- 2026-06-18 — Created from round-1 audit Q16.
- 2026-06-19 — Scoped with a 13-agent audit workflow (one agent per mutation route → traced route→repo→client, adversarial verify stage). Confirmed **4 real swallows**, **0 false positives**, **5 routes already correct** (plan/action, shortlist, sign-claim, leads, account/delete). Root cause is uniform: PostgREST/storage-js (v2.107.0) resolve a failed write as an `{ error }` value (no throw, unless `.throwOnError()`), so repos that return `null`/`void` on error and routes that don't inspect the result return 2xx on a failed write. Best-effort derived side-effects (`invalidatePlan`, `reScoreAssessment`) left as caught+logged by design — they are not the primary write.

## Done evidence

**DONE locally 2026-06-19 (NOT pushed; awaiting founder GO). Gate green: typecheck clean, lint 0 errors, 1106/1106 tests (was 1098, +8).**

Server-side primary-write fixes (each TDD'd: failing test → fix):
1. **`app/api/profile/section/route.ts`** + **`lib/profiles/repo.ts`** — `patchProfileSection`'s new-user `upsertProfile` fallback discarded its `null` return → first-ever save reported `ok:true` while nothing persisted (the client showed "Saved"). Repo now throws when the fallback fails; route wraps the call → logs + `500`. Tests: `tests/profiles/repo.test.ts` (throws when fallback fails), `tests/api/profile-section.test.ts` (route 500, never ok:true, no side-effects).
2. **`app/api/documents/[id]/route.ts` (DELETE)** — inline storage-remove + row-delete errors ignored → `ok:true` with the row still present. Both errors now captured → log + `500`. Tests: `tests/api/documents/delete.test.ts` (row-delete fails → 500; storage-remove fails → 500).
3. **`app/api/documents/upload/route.ts` (POST)** — `insertDocument` returns `null` on failure → `{ id:null, status:"stored" }` 200 with the file orphaned in Storage. Null now → log + roll back the orphaned object + `500`. Test: `tests/api/documents/upload.test.ts` (insert fails → 500 + orphan removed + no flag-flip).
4. **`app/api/assess/route.ts` (POST)** — signed-in assessment insert returned the failure as an `error` *value*, so `persistFailed` stayed false → 200 with `id:null` (results shown, nothing saved). Now sets `persistFailed` + logs on the error path and skips dependent writes (existing `persistFailed && user` guard returns the 500). Test: `tests/api/assess-persist.test.ts` (error-value insert → 500, dependent writes skipped). Anon path keeps its deliberate 200/`id:null` (3-day ephemeral) but now logs the miss.

Client fix (AC-3):
5. **`components/documents/document-card.tsx`** — `handleDelete` cleared the card unconditionally (ignored `res.ok`). Now guards on `res.ok` and shows "Couldn't delete — please try again", mirroring `handleUpload`/`handleView`. Test: `tests/components/documents/document-card.test.tsx` (failed delete keeps the card + error; success removes it).

Logging (AC-2):
6. **`app/api/leads/route.ts`** — previously a bare `catch {}` (surfaced 500 but logged nothing); now `console.error("[leads] createLead failed", { assessmentId, err })`.

**Already correct (no change, verified):** `plan/action` (`status: ok?200:500`), `shortlist` (same), `results/sign-claim` (try/catch→500, logged), `account/delete` (partial-failure→500, from MV-05).
