# Research Ingestion Pipeline — Nepal → Australia

**Created:** 2026-06-05
**Purpose:** Turn ~25 unstructured research dumps (from Gemini Deep Research / Perplexity / ChatGPT) into integrated, verified codebase data **without dropping a single finding**.
**Companion brief:** `docs/research-briefs/2026-06-05-nepal-australia-deep-research.md` (the 25 topic prompts + output formats this pipeline consumes).

---

## The principle

You cannot guarantee "nothing was missed" by reading carefully — humans and agents both skim past facts buried in prose. You guarantee it by **converting prose into a countable ledger of atomic facts, each with a status, and refusing to call the work done until every row has a terminal status.** Double-entry bookkeeping for facts.

Two failure modes this pipeline is designed to kill:

- **Silent drop** — a fact in the dump never makes it into any structured form and nobody notices.
- **Stranded data** — a fact is extracted but never integrated, and rots in a file forever.

The honest goal is **not** "use 100% of findings" — some will be wrong, stale, duplicate, or out of scope. The goal is **account for 100%**: every finding ends as `used` or `rejected:<reason>`, with **zero `pending`**.

---

## The two output forms (what comes back)

Every topic returns one or both (enforced by the brief's Output format section):

1. **Entity CSV** — for catalog topics (A1, B2, C1, D1, E1, E2, E3, J1, J2). One row per real-world entity, fixed columns.
2. **Atomic findings table** — the universal net. One row per discrete fact, with `ID, Claim, Entity, Attribute, Source URL, Publisher, Source date, Confidence, Type, Caveats`. Primary deliverable for narrative topics; overflow net for catalog topics so loose context never falls through.

Each topic ends with `Total findings: N` — the source-side count we check parity against.

---

## The 6 stages

### 1. Intake (verbatim capture)
User drops each raw dump, unaltered, at:
```
docs/research-briefs/raw-results/<topic-id>.{md,csv,json}
```
Never paraphrase at intake. This is the source of truth we can always re-derive from.

### 2. Atomic extraction
One subagent per topic, in parallel. Each reads its raw dump and emits a JSONL findings file:
```
docs/research-briefs/findings/<topic-id>.jsonl
```
One row per discrete claim. Atomicity is the whole game — "Bank X needs NPR 4M collateral and takes 21 days" is **two** rows.

```jsonl
{"id":"A1.001","topic":"A1","claim":"...","entity":"...","attribute":"...","value":"...","source":"url","publisher":"gov|university|bank|consultancy|news|forum|blog","source_date":"YYYY-MM","confidence":"primary|practitioner|anecdotal","claim_type":"data|process|contact|red-flag","target":"nepal-banks.ts|unis-migration|NEEDS-SCHEMA|...","conflict_with":null,"status":"pending"}
```

**Completeness critic (cheap insurance):** a second-pass agent per topic re-reads the raw dump asking *only* "what claims are here that are NOT already in the JSONL?" This catches the exact failure mode — a fact buried mid-paragraph that the first pass skimmed. Anything it finds is appended before the topic is considered extracted.

Extraction asserts count parity against the dump's `Total findings: N`.

### 3. Master ledger
Append every JSONL row from every topic into a single source of truth:
```
docs/research-briefs/findings-ledger.md   (generated from the JSONL, not hand-edited)
```
This is where completeness is **measured**, not hoped for: `count(ledger rows) == sum(rows across all JSONL files)`. Every row starts `pending`. Because volume is large (~25 topics × ~50 facts ≈ 1,250 rows), the JSONL is the machine-truth and the markdown ledger is a generated view.

### 4. Conflict resolution
When two findings disagree, precedence decides:

> `primary` (gov) > `primary` (institution's own data, e.g. a `.edu.au` page about itself) > newer `source_date` > more specific > `practitioner` > `anecdotal`

- Cross-tier conflicts auto-resolve by the rule; the loser stays in the ledger marked `rejected:superseded-by:<id>` (never deleted).
- **Same-tier** disagreements do **not** auto-resolve — flag `status: review` for a human call.
- Dedup across topics keys on `(target, entity, attribute)`, keeping the **higher-confidence** source, not first-seen.

### 5. Integration (target-by-target)
Work one target file at a time — finish all `nepal-banks.ts` rows before moving on — so commits stay focused. Each row flips to a terminal state with an audit trail:
- `used` + the commit hash, or
- `rejected:<reason>` (wrong / stale / duplicate / out-of-scope).

Rows whose `target` is `NEEDS-SCHEMA` (e.g. "12 new document kinds") spin off their own mini-plan — a code change, not a data edit — so they don't rot as `pending`.

### 6. Verification gate (closing the books)
Definition of done for the whole ingestion:
- [ ] **Zero `pending` rows** in the ledger.
- [ ] **Count parity** per topic: dump's `Total findings: N` == JSONL rows == ledger rows (or a logged reason for any delta).
- [ ] **Entity parity** where countable: research found 47 unis → DB has 47, or a logged reason.
- [ ] **Spot-check** N random `used` rows against production — the value actually shows up where the ledger says it does.
- [ ] Every `review`-flagged conflict resolved.

---

## Locked conventions

- **Atomicity granularity:** one row per `(entity, attribute)` pair. Too coarse hides sub-facts; too fine explodes the ledger.
- **Never delete a finding** — losers and rejects stay in the ledger with a reason. Deletion breaks the audit trail.
- **Keep every occurrence at extraction** — corroboration is signal; dedup happens later, at the ledger, not during extraction.
- **`UNSOURCED` over omission** — weak claims surface as low-confidence rows, never vanish, never masquerade as fact.

---

## Topic → target map

See the **"What integration looks like once data lands"** section of the companion brief for the full per-topic → code-target mapping (documents → `lib/documents/types.ts`, banks → `lib/data/source/nepal-banks.ts`, universities → seed migration, etc.). Priority order is in the brief's **"Priority order"** section — Tier 1 is D1 (universities), A3/A4 (NOC/PCC), B2 (bank loans), I1/I2 (refusals).
