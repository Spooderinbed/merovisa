# MV-68 — Ground-truth audit (2026-06-27)

**Why this audit.** Two "next slices" in a row turned out already-built (MV-66's matches/plan,
then "Phase 5 documents/Storage"). Root cause: `CLAUDE.md` "Project State" + `docs/PROJECT_STATUS.md`
are stale and mis-steer next-slice picks — they even mis-fed Codex. The founder chose **"audit first,
then pick."** This is the ground-truth pass: what is *genuinely* incomplete, judged by **student
outcome** (every self-serve dead-end = a bounce to a local consultancy, which the app exists to replace).

**Method.** Read-only fan-out, 4 parallel agents — (A) document-readiness loop, (B) plan/results
trust + cross-links + progression, (C) route-resilience parity, (D) AI-guide reality + stale-doc
reconciliation.

## Findings

### 1. Document-readiness loop — PARTIALLY WIRED (the genuine gap) ⭐
- **No "X of Y required documents complete → ready to apply" aggregate exists anywhere** — no count,
  no fraction, no readiness gate/CTA.
- Three independent per-item "done" signals coexist with **no rollup**:
  - uploaded file → that program's checklist row flips to "✓ Have"
    (`app/(app)/checklist/[programId]/page.tsx:39-41` → `lib/checklist/generator.ts:140-142 statusFor`)
  - plan state mirrored onto checklist rows (`lib/checklist/plan-links.ts:14-22`, 7 keys;
    `medical` deliberately unmapped)
  - global `document_status.obtained` toggles on `/checklist/all`
    (`lib/documents/status-repo.ts:13-19,27-40`)
- **MV-53's global toggle is a dead-end branch:** `listObtainedKinds` has exactly ONE caller —
  `app/(app)/checklist/all/page.tsx`. Its `obtained` set feeds only that page's own checkboxes; it is
  never read by the per-program checklist, the plan, or any count. A student ticks everything on
  `/checklist/all` and **nothing else in the product changes.**
- Naming-vs-reality seam: `/checklist/all` says "tick off each document as you obtain it"
  (`:29,:31`) but those ticks live in an isolated table no other surface consumes.
- **Student-outcome impact:** a student can upload/mark everything and still get **no system signal
  that they're actually ready to apply** — precisely the reassurance a consultancy sells. Highest-value
  buildable gap.

### 2. Plan / results / dashboard trust — CLEAN
- All cross-links (plan↔checklist↔documents, dashboard tiles, results next-steps) resolve to real
  routes + real data (file:line verified).
- No fabricated copy: the old "23-step guide / 14-docs" gate is confirmed removed. No raw % shown
  (AccuracyMeter floors to quartiles, labels "{level} confidence"; `%` appears only as CSS bar width
  or the student's own echoed GPA/loan rates).

### 3. Journey-progression visual — ABSENT (confirms MV-45 not-built)
- Only an intra-wizard stepper exists. No cross-stage "where am I / what's next" across
  wizard → results → account → documents → apply. Natural home: signed-in shell
  `app/(app)/layout.tsx` rail + anon leg seeded from the focused results page.

### 4. Route-resilience parity — ONE remaining gap
- `(focused)` ✓ (MV-66), `(app)` ✓ (MV-62), `global-error.tsx` ✓.
- **`(marketing)` group has NO error.tsx / loading.tsx**, yet `app/(marketing)/page.tsx`,
  `.../auth/page.tsx`, and `.../layout.tsx` all do live `supabase.auth.getUser()` reads. A thrown/slow
  auth read → blank frame or bubble to the document-replacing global-error on the **first-impression
  landing surface**. Lower student-outcome impact than the readiness loop, but cheap; completes the
  parity story.

### 5. AI guide (Phase 6) — FULLY BUILT, graceful degradation (founder-owed, not a gap)
- Real: `app/(app)/guide/page.tsx`, `components/guide/guide-chat.tsx`, `app/api/guide/chat/route.ts`,
  `lib/guide/{deepseek,context,system-prompt}.ts`, tests under `tests/guide/`.
- Gated only on `DEEPSEEK_API_KEY` (DeepSeek's OpenAI-compatible endpoint — **not** Anthropic).
  Missing key → `deepseek.ts:23-24` throws → route catches (`route.ts:64-72`) → calm 503; UI shows a
  `role="alert"` "couldn't answer just now" and the page still renders. No fabricated chat content.
- Action is **founder-owed**: add `DEEPSEEK_API_KEY` to Vercel (the MV-63 park).

## Stale-doc reconciliation (the other half of MV-68)
Applied in this branch:
- `CLAUDE.md:9` "Not built yet: Phase 5 / Phase 6" → both shipped; only the guide's Vercel-key park remains.
- `CLAUDE.md:8` "5 migrations … 380+ tests" → 9 migrations, ~1450 tests.
- `CLAUDE.md:7` "Phases 0–4 merged … focus: ledger-wiring" → Phases 0–6 merged; focus = journey
  completeness/reliability (ledger-% retired 2026-06-26).
- `docs/PROJECT_STATUS.md:31` "/guide stub — Coming soon" → live grounded DeepSeek chat, parked on Vercel key.
- `docs/PROJECT_STATUS.md:65-67` "Not built yet: Phase 6 … Anthropic SDK … guide_threads tables …
  SSE streaming" → all wrong (stateless, non-streaming, DeepSeek); block removed, "Phase 6 shipped" added.
- `docs/PROJECT_STATUS.md:5,:425` snapshot/footer dates predate Phases 5/6 → refreshed.

## True next slice (ranked by student outcome)
1. **⭐ Recommended — MV-69: document-readiness rollup ("X of Y required → ready to apply").**
   Wire the three isolated done-signals into one real, data-derived readiness count per program,
   surfaced on checklist/documents/dashboard, with an honest "ready to apply" state. Reconnect or
   retire the dead `/checklist/all` `document_status` branch as part of it. This is the
   consultancy-replacement reassurance.
2. Runner-up — **MV-70: `(marketing)` error/loading boundary** (cheap parity completion; protects the
   first impression).
3. Larger/enhancement — **MV-45: cross-stage journey progression visual** (confirmed not-built;
   orientation, design-heavy).
