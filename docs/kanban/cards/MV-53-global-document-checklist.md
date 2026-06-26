# MV-53 — Global document checklist + persisted "I have this" toggle

**Status:** IN REVIEW — SHIPPED 2026-06-26 on branch `mv-51` (branch+PR flow). Founder closes to Done after the PR merges and the migration is applied to prod.

Relates to: the documents domain (`lib/documents/types.ts` `DOCUMENT_META`, `lib/documents/repo.ts`) and the checklist surface (`app/(app)/checklist/`). Source: the 2026-06-26 founder-gap triage (gap — "the document checklist is ONLY per-program; no global view and no persisted 'obtained' state independent of file upload").

## Problem

The checklist was only per-program (`/checklist/[programId]`), and "have" was inferred purely from an uploaded file's presence (`documents.status` was dropped in `20260605000000_simplify_documents.sql`). A student had no single place to track "I've obtained this document" across programs, and no way to mark a document obtained without uploading a photo of it.

## Schema decision — Option B (a new orthogonal table), Codex-concurred

A new table `public.document_status` keyed `(owner, kind)` with a boolean `obtained`, leaving the `documents` table and `lib/checklist/generator.ts` **completely untouched**.

Why not restore a `documents.status` column: `documents.file_path` / `file_size` are `NOT NULL`, so an "obtained but not uploaded" state cannot be a `documents` row at all. And the per-program checklist generator derives "have" from *uploaded kinds*, not any DB column — its goldens trace to upload presence. An orthogonal status table is therefore the only shape that supports upload-independent "obtained" **and** churns zero existing goldens. The board card's own Codex risk note ("confirm schema/column intent BEFORE writing tests — a wrong column name invalidates goldens") is satisfied: nothing the generator reads was touched.

The per-program checklist (file-derived "have") keeps working unchanged; this is a second, parallel signal, not a replacement.

## Correctness — kinds in lockstep

The SQL `check (kind in (...))` constraint and the Zod enum are **both** the exact `DOCUMENT_KINDS` set from `lib/documents/types.ts` (the Zod enum is derived directly via `z.enum(DOCUMENT_KINDS)`; the SQL list was machine-verified against it). Programmatic cross-check at build time: 20 kinds, identical set and order, zero drift — so a valid toggle is never rejected by either layer. The global page renders by iterating `GROUPS` → `DOCUMENT_META` (same source of truth as `app/(app)/documents/page.tsx`), never a re-listed kind set.

## What shipped (file list)

- **Migration** `supabase/migrations/20260626000000_add_document_status.sql` — `public.document_status (owner, kind, obtained, updated_at, primary key (owner,kind))` + `owner` index. RLS mirrors the outcomes-migration idiom (`enable` + `force` row level security; per-op owner-scoped policies `ds_select/insert/update/delete_own` using/with-check `(select auth.uid()) = owner`; explicit `revoke all from anon, authenticated` then `grant select,insert,update,delete to authenticated`). The UPDATE policy carries **both** `using` and `with check` so an upsert-on-conflict update is allowed. USER-owned toggle via the RLS client (authenticated, NOT service_role). No backfill — `obtained` is set only by explicit user toggle; default-empty.
- **Supabase types** `lib/supabase/types.ts` — hand-added the `document_status` Row/Insert/Update table type (no live DB to codegen against), matching the existing table-type style and codegen ordering (placed right after `documents`).
- **Repo** `lib/documents/status-repo.ts` (`import "server-only"`, mirrors `repo.ts`) — `listObtainedKinds(db, userId): Promise<Set<DocumentKind>>` (selects kinds where `obtained=true`); `setObtained(db, userId, kind, obtained)` — **ON** upserts `(owner,kind)` `obtained=true` (`onConflict: "owner,kind"`); **OFF** deletes the row. Choice: delete-and-treat-absence-as-false, so there is never a stale `obtained=false` row to reconcile (documented in the repo).
- **Zod schema** `lib/validation/documents.ts` — `DocumentStatusSchema = z.object({ kind: z.enum(DOCUMENT_KINDS), obtained: z.boolean() })` (convention matches `lib/validation/outcomes.ts`).
- **API route** `app/api/documents/status/route.ts` (POST) — mirrors `app/api/outcomes/event/route.ts`: JSON parse → `safeParse` (422 on failure) → `createSupabaseServerClient` → `getUser` (401 if anon) → owner-scoped `setObtained` via the RLS server client → 200. owner is read from the session, never the body.
- **Global page** `app/(app)/checklist/all/page.tsx` — auth-gated like `app/(app)/documents/page.tsx`; reads the obtained-set server-side via `listObtainedKinds`; renders every `GROUPS` → `DOCUMENT_META` group with a per-kind toggle.
- **Toggle** `components/documents/document-status-toggle.tsx` (`"use client"`) — a checkbox whose accessible name is the document label; flips optimistically, POSTs to `/api/documents/status`, `router.refresh()` on success, rolls back on failure.
- **Reachability** `components/checklist/checklist-landing.tsx` — added a "Your overall document checklist" card linking to `/checklist/all` (via `next/link`), directly under the header, above the per-program list. Per-program views untouched.

## Trust-first held

No raw percentages, no fabricated data, no scorer path touched. The toggle is a plain user-owned fact ("I have obtained this"), owner-scoped by RLS, with no inference or calibration. The per-program file-derived checklist is unchanged, so the two signals stay distinct and honest.

## Reachability / nav decision (founder-adjustable)

**Decision:** surface the global page from the **existing `/checklist` landing** (a new "Your overall document checklist" card → `/checklist/all`), rather than adding a new top-level `NAV_APP` / `mobile-tab-bar` entry. Rationale: the least-invasive path. `NAV_APP` is a deliberately reconciled six-item set (Home / Matches / My plan / Profile / Documents / Guide) and the mobile tab bar is capped at five core surfaces; `/checklist` itself is **not** in the nav today (per-program checklists are reached from program cards), so the landing page is the natural home for "pick a checklist," and the global list belongs right there alongside the per-program ones. **Founder call:** the label ("Your overall document checklist"), its placement (top of the landing), and whether the global checklist eventually deserves its own nav entry are an IA/copy sign-off — flagged, not blocking.

## Test plan / evidence (TDD RED→GREEN, +18 net)

Every unit was RED-first (failing for the right reason — missing module/feature, confirmed before writing code):

- `tests/documents/status-repo.test.ts` (4) — `listObtainedKinds` returns a `Set` of obtained kinds and hits `from("document_status")` + `eq("owner")` + `eq("obtained", true)`; empty set on no data; `setObtained(true)` upserts with `onConflict: "owner,kind"` and never deletes; `setObtained(false)` deletes scoped to `(owner, kind)` and never upserts.
- `tests/documents/status-schema.test.ts` (3) — accepts every real `DOCUMENT_KINDS` kind with a boolean; rejects an unknown kind; rejects missing/non-boolean `obtained`.
- `tests/api/documents-status.test.ts` (6) — 401 anon, 422 unknown kind, 422 missing `obtained`, 400 invalid JSON, 200 + owner-scoped `setObtained(…, "owner1", kind, true)`, and `obtained=false` passthrough.
- `tests/components/documents/document-status-toggle.test.tsx` (4) — reflects initial state both ways; optimistic flip + POST body `{ kind, obtained: true }` to `/api/documents/status`; rollback on a 500.
- `tests/checklist/checklist-landing.test.tsx` (+1) — the landing offers the global checklist link to `/checklist/all`.

**Gate green:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `done`-unused warning in `docs/kanban/build.mjs`, unrelated) · full suite **1395 passed** (235 files, was 1377 — +18). **Option B proof:** `tests/checklist/generator.test.ts`, `tests/documents/repo.test.ts`, and all `tests/checklist/*` stayed green (80 tests) untouched — zero golden churn. `git status` confirms none of `lib/checklist/generator.ts`, `lib/documents/repo.ts`, the `documents` migrations, `au-cricos-codes.ts`, or `.claude/*` were modified.

## Out of scope (deliberate)

- **Restoring `documents.status`** — rejected above (can't represent obtained-without-upload; touches generator goldens).
- **Replacing the per-program file-derived "have"** — kept as a separate, parallel signal.
- **A new top-level nav entry** — deferred to the founder IA call (surfaced from the checklist landing instead).
- **Showing obtained-state on the per-program checklist / documents vault** — would be its own slice; this card adds the global view + store only.

## Founder-owned residuals (not blockers)

- **Apply the migration to prod** — `20260626000000_add_document_status.sql` (the only founder step, per the MV-08 apply-ahead-of-traffic pattern). The route/page are inert until the table exists.
- **Merge the PR to master**, then close this card to **Done**.
- **Nav label / IA sign-off** — confirm the "Your overall document checklist" label + placement (and whether it eventually warrants its own nav entry).

## How a cold agent resumes

Done and gated. The change is one new table (`document_status`, Option B — `documents` and `generator.ts` untouched), a `server-only` repo (`status-repo.ts`), a Zod schema (`validation/documents.ts`, enum = `DOCUMENT_KINDS`), a POST route (`api/documents/status/route.ts`, mirrors the outcomes-event route), a global page (`checklist/all/page.tsx`, iterates `GROUPS`/`DOCUMENT_META`), an optimistic `"use client"` toggle, and a landing-page link. To extend: surfacing obtained-state on other surfaces reuses `listObtainedKinds`; new document kinds must be added in `DOCUMENT_KINDS` **and** the migration's check constraint together (they are kept in exact lockstep).
