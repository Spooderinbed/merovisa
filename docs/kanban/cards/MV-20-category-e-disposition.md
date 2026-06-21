# MV-20 — Category-E pending-findings disposition pass

**Column:** In review · **Priority:** P3 · **Owner:** agent · **Gate:** human (founder)
**Created:** 2026-06-21 · **Entered review:** 2026-06-21
**Disposition outcome:** **ZERO ledger edits — and that is the correct result.** Substantive E value
already integrated (MV-13); nothing mis-parked or autonomously rejectable; the one genuine follow-on
(program-English enrichment) is founder-DB-gated → spun into **[[MV-21]]**.
**Related:** [[MV-06]] (surfaced the 4 ready Category-I findings; deferred the 45 ready E),
[[MV-13]] (bridged the *homeable* E findings into the DB catalogue → they are already `used`).
This card disposes the **residual** E pending findings MV-06/MV-13 left parked.

## Premise correction (established 2026-06-21, before any edit)

The queue framed this as "~93 pending Category-E findings need disposition." On contact with the
real ledger the premise is **mostly already resolved**:

- `findings/E.jsonl` today: **176 total — 80 `used`, 93 `pending`, 3 `rejected:ephemeral-jobad`.**
  This is **byte-identical to MV-06's 2026-06-19 snapshot** → nothing flipped since; the homeable E
  value was already harvested by the earlier sourcing slice + MV-13.
- The 93 pending split (by the 2026-06-10 triage): **`ready`=45 · `use-later`=25 · `needs-human-call`=23.**
- **All 45 `ready` have `value_status:"unset"` and are cited by ZERO registered TS fact modules**
  (`au-rmit-programs.ts` / `au-university-programs.ts` / `au-pathway-programs.ts` — grep-confirmed 0
  hits). That is *why* `flip-status` correctly leaves them pending: a finding flips to `used` only
  when a registered module declares it in `findingRefs[]` (machine-derived, never hand-edited).
- All 45 `ready` target the dormant `lib/data/programs seed (+ course-career)` fact layer. Entity mix:
  program-specific facts (UTS Pharmacy ×5, RMIT Social Work/Nursing/Pharmacy/Ed, Deakin DS, ECU ×2,
  Torrens ×1 — some about MV-13-bridged programs, some about deferred Torrens/diploma/ECU), post-study
  **485 / skilled-occupation policy** (`process`), and **Nepal employer/salary anchors** (Verisk,
  IME, hospitals, hotels — overlap the founder-owned job-ad-salary editorial concern).

**Consequence:** a 93-finding "disposition sweep" would be *wrong*. These findings can't be `used`
(no live home; would require building unbuilt surfaces) and **must not** be `rejected` (they are
valid, sourced, in-scope deferred value). Forcing either would manufacture work or destroy value.

## What disposition IS available (the honest, bounded scope)

1. **Reject the genuinely-unusable** — any pending E finding that is ephemeral non-gov single-source
   data (Nepal salary snapshots in the employer-anchor cluster) matching the **E.158–160
   `rejected:ephemeral-jobad`** precedent. These need a salary-evidence policy before any use and
   should leave the pending pool. (Status reject IS hand-set, unlike `used`.)
2. **Surface any subset MV-13 genuinely homed** — if a ready finding asserts a field a *now-bridged*
   program card renders and isn't yet sourced, wire it via the registered module → `FLIP_STATUS`
   ritual (MV-06 pattern). Expected small/zero (MV-13 already took the clean twins).
3. **Record the disposition-of-record** for the remainder: durable-but-homeless findings stay
   correctly `pending`; `needs-human-call` stays founder-owned. Document the reason so the ledger's
   "ready" backlog stops overstating actionable work.

Conservative default (matching the 2026-06-10 triage's own rule): **uncertainty → keep pending.**

## Plan

- [ ] Per-finding recon (delegated, evidence-required) of the 45 `ready` (+ scan 25 `use-later`):
      bucket each → {reject-candidate / homeable-now / keep-pending-deferred} with source + file:line.
- [ ] Apply only the clearly-correct low-risk actions: ephemeral-salary rejects + any clean flips,
      via the established ritual (no hand-edit of `status:used`; `FLIP_STATUS=1 npx vitest run
      tests/data/flip-status.run.test.ts`; goldens byte-identical; reconcile/findings-integrity/
      flip-status guards green). Never stage the WIP trio; explicit `git add` paths only.
- [ ] Regenerate the ledger (`node docs/research-briefs/_tools/build-ledger.js`); confirm counts.
- [ ] Document the deferred remainder with reasons (not silently dropped); bring the founder a tight
      "rejected N, surfaced M, parked the rest because no home" packet.

## Disposition result (2026-06-21) — per-finding recon (delegated) + self-verified

Recon: one read-only subagent bucketed the 45 `ready` (+ scanned the 25 `use-later`) with file:line
evidence; I then **independently verified** the two load-bearing claims (the reject call + the
"no-home" claim) rather than trust them secondhand.

**Bucket A — REJECT: 0 (verified).** I read the claims of all 13 employer-anchor `ready` findings:
they are **durable institutional facts**, not ephemeral job-ad/salary data — e.g. NRB "20 commercial
banks as of mid-Jan 2026" (gov), Grande "200-bed facility", IOM "nursing programs bachelor→doctorate",
MoHP National Digital Health Platform (gov), hotel/employer self-descriptions. **None match the
E.158–160 `rejected:ephemeral-jobad` precedent** (those are dated *salary* snapshots). Conservative
default honoured: no `ready` row rejected. Reject reason-code lives **in the `status` string**
(`rejected:ephemeral-jobad`) + a human note in `caveats`; there is no separate `reject_reason` field.

**Bucket B — HOMEABLE-NOW: 9 findings, ALL founder-DB-gated (verified).** E.044/086/094/112/113/119/120
(RMIT IELTS) + E.169 (RMIT B-Nursing intake/notes) + E.050 (Deakin Master of Data Science IELTS).
Verified: the **RMIT TS module has no English/IELTS field at all** (`/ielts|english|overallMin/` →
`false`); the uni module **has** the field shape but the Deakin entry sets **no** English value
(`findingRefs:["E.049"]`, tuition only). So homing *any* of the 9 — even E.050 — adds a **new IELTS
value onto a live, prod-bridged program row**, which cascades `module → bridge-fact-parity → seed.ts →
a NEW prod-UPDATE migration` (founder-gated; MV-13's migration is already applied to prod). The RMIT
seven additionally need an English field added to the RMIT program **type** first. **This is the MV-13
follow-on, not an autonomous copy edit** → carded as **[[MV-21]]** (Backlog, founder-DB-gated).
Possible goldens impact (min_english may feed match eligibility) is an MV-21 design question.

**Bucket C — KEEP-PENDING-DEFERRED: 36 (no change, correct).** Grouped blocking reasons: unbuilt
485 / skilled-occupation / Australian-study-requirement policy surface (5: E.017–020,024); unbuilt
course→career employer-anchor surface (13: E.124,126,132,133,134,137,138,139,140,142,144,145,146);
Torrens/ECU not in catalogue — MV-13 D2 deferral (3: E.025,147,148); UniMelb admissions-policy prose,
no per-program field (1: E.121); RMIT diploma/grad-diploma/advanced-nursing the engine never surfaces
(3: E.083,088,091); no clean seed twin / name-mismatch (3: E.053,087,+1); UTS-Pharmacy
compliance/pathway (WWCC, police check, ITP, Pharmacy-Board) — checklist surface not built (8).

**needs-human-call: 23 (founder-owned, untouched).** Plus **5 `use-later` vacancy listings**
(E.127,128,129,131,143 — single non-gov blog job-ad openings, same source-class as E.158–160) are
**flagged into the founder-owned Nepal job-ad-evidence policy bucket**, not unilaterally rejected (the
2026-06-10 triage human-queue explicitly reserves the job-ad-evidence policy for the founder).

**Bottom line:** the "~93 pending need disposition" premise was inflated. The disposition of record:
already-integrated (the 80 `used` + MV-13) · 0 rejectable in `ready` · 9 homeable but founder-DB-gated
(→ MV-21) · 36 correctly parked · 23 + 5 founder-owned. **No ledger/data file changed this pass**
(by design — manufacturing flips/rejects would violate the trust-first + don't-over-claim discipline).

## Acceptance criteria

- [x] Every pending E finding has a recorded disposition decision (reject / surface / park-with-reason).
      → see Disposition result: A=0, B=9 (gated→MV-21), C=36 parked, 23+5 founder-owned.
- [x] Any `status` change is reject-only + reason-coded, or a `used` flip wired through a registered
      module — **N/A this pass: 0 changes** (nothing rejectable; homeable set is founder-DB-gated).
      Goldens untouched (no file changed); ledger unchanged so guards remain green by construction.
- [x] No valid deferred finding wrongly rejected; no `used` over-claimed. (Verified the reject call
      myself; declined to flip the gated B-set or reject the founder-owned vacancy rows.)
- [x] Founder packet delivered (this dossier + the session report). **Founder-owed:** the 23
      `needs-human-call` editorial calls; the 5 `use-later` vacancy rows' job-ad-evidence policy;
      and approving **[[MV-21]]**'s prod migration if the program-English value is wanted.

## Resume notes (cold agent)

- The flip is **machine-derived** from registered-module `findingRefs` — read [[MV-06]] build-progress
  + the `ledger-slice-rituals` memory before touching the ledger. Reject status IS hand-set in the
  JSONL (see the 3 `ephemeral-jobad` rows for the exact field shape).
- Moved to In Review on conclusion (zero-code disposition-of-record, like MV-06's scoping outcome).
  In Review is now at WIP 5 (MV-10/17/18/19/20, all founder-gated) — **WIP-over by 2**; the real
  bottleneck is the founder-gate backlog, not new agent work. Flagged in the session report; the
  founder closing the gated stack to Done is the recommended unblock.
- The agent-ownable queue (CI / re-assess / Category-E) is now **exhausted**; remaining work is
  founder-gated (MV-21 prod migration, MV-05/08 legal+smoke) or the next value-triage cluster.
