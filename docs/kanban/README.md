# MyVisa Kanban — operating manual

This is how we run work on MyVisa. It exists so that **before touching anything we
check the board, and the board always reflects reality.** The board is maintained
primarily by the AI agent (Claude Code); the founder reviews and steers at the
Human gate.

- **Board state (source of truth):** [board.json](board.json) — columns + each card's state, priority, and timestamps.
- **The board (generated views):** [board.md](board.md) (markdown, for git/PRs) and [board.html](board.html) (standalone visual dashboard — open in a browser). **Both are generated — never hand-edit them.**
- **Generator:** [build.mjs](build.mjs) — run `npm run board` after any change to `board.json`.
- **Card detail:** [cards/](cards/) — one dossier file per card.
- **Why these cards:** linked from each card → the audit, plan, and checkpoint docs.

### Architecture in one line
`board.json` (state) + `cards/*.md` (detail) are hand-edited → `npm run board` →
`board.md` + `board.html` (views). State lives in exactly one place, so the views
can never disagree with each other.

---

## The board is the single source of truth for *current work state* — and nothing else

| Lives on the board (board.json) | Lives in the linked docs (history / evidence) |
|---|---|
| What is next, ready, active, blocked, in review, or just-done | The 18-concern audit (`docs/audits/2026-06-18-full-app-evaluation.md`) |
| Each card's column, priority, owner, timestamps | The forward plan (`.claude/plans/tender-bouncing-locket.md`) |
| (Card detail — acceptance criteria, resume notes — lives in `cards/*.md`) | The phase log (`docs/PROJECT_STATUS.md`) |
| | The execution checkpoint + research ledger |

Evidence docs are **write-once history**; `board.json` is the **live, mutable surface**.
Cards link outward to evidence — they never duplicate it.

---

## Columns

| Column | WIP | Meaning |
|---|---|---|
| 🔵 **Backlog** | — | Captured, not yet refined. No dossier required yet. |
| 🟢 **Ready** | 5 | Refined; meets Definition of Ready. A cold agent can pick it up. Has a dossier. |
| 🟡 **In Progress** | 1 | Being built right now. One slice at a time. |
| 🟣 **In Review** | 3 | Integration gate passed (machine-green); awaiting founder accept / GO. |
| ⛔ **Blocked** | — | Waiting on an external unblock (data sourcing, an approval, auth). Reason on the card. |
| ✅ **Done** | — | Accepted or merged. Detail collapses into the linked checkpoint/status docs. |

WIP limits are real: keep **one** slice in progress; let finished, green work queue at
the Human gate rather than starting a second build.

---

## Definition of Ready (Backlog → Ready)

A card may enter **Ready** only when its dossier has:
1. a clear user/business **outcome** (not just "refactor X"),
2. concrete, observable **acceptance criteria**,
3. a **test plan** (what unit/integration coverage proves it),
4. the exact **integration gate** command,
5. **dependencies / blocked-by** listed,
6. enough **context links + resume notes** that an agent with no memory can start cold.

## Definition of Done (In Review → Done)

A card is **Done** only when:
1. the intended tests were written/updated and they pass,
2. the **integration gate is green**: `npm run typecheck` · `npm run lint` · `npm test`,
3. scoring/versioning implications are recorded (RULE_VERSION/goldens) if scoring was touched,
4. evidence (commands run, results, commit/branch) is on the card,
5. the founder has **accepted** — or explicitly waived review.

---

## The ritual (follow this every work cycle)

**Before starting:**
1. Read the board (`board.md`, or open `board.html`).
2. Pick the top **Ready** card (respect WIP = 1 in progress). If nothing is Ready, refine the top Backlog card to Ready first.
3. In `board.json`, set the card's `col` to `inprogress` and update its `entered` date; run `npm run board`. Read its dossier fully.

**While building:** work the slice TDD-first; log decisions in the card's Decision Log.

**Before handing back / checkpointing / compacting:**
4. Run the integration gate. Record the result as **Done Evidence** on the card's dossier.
5. In `board.json`, move the card to `inreview` (update `entered`); run `npm run board`; tell the founder what's waiting.
6. **Regenerate + commit the board before you checkpoint or compact** — a stale board is the top failure mode.

> Moving a card = edit one field in `board.json` (+ `entered` date) then `npm run board`.
> The `entered` timestamp is what powers card-age, cycle-time, and stale warnings — keep it honest.

The founder accepts (→ Done) or sends it back (→ In Progress with notes).

---

## Anti-drift rules

1. **Card state lives ONLY in [board.json](board.json).** `board.md` and `board.html` are generated — never hand-edit them, and never store a card's column anywhere but `board.json`. (This is why dossiers have no `Column:` field.)
2. **Cards link to evidence; they never copy it.** If a number/figure matters, link the source doc.
3. **No card enters Ready or In Progress without Resume Notes + Context Links.** A cold agent must be able to act from the card alone.
4. **Regenerate (`npm run board`) and commit before any compaction or handback.** No exceptions.

---

## Card dossier schema (`cards/<ID>.md`)

```
# <ID> — <Title>

**Priority:** P1 / P2 / P3   **Owner:** agent / founder
**Goal:** the user/business result, one sentence.

## Context links
- audit / plan / checkpoint / code areas this card touches

## Acceptance criteria
- observable behaviour required (checklist)

## Test plan
- unit / integration / e2e coverage that proves it

## Integration gate
- exact command(s) to run before In Review

## Dependencies / blocked-by
- cards, data, MCPs, migrations, decisions

## Risk notes
- trust / legal / scoring / auth / data / Supabase concerns

## Agent resume notes (for a cold start)
- the very next concrete action, assuming no memory

## Decision log
- dated one-liners as work proceeds

## Done evidence
- tests run, results, commit/branch, reviewer outcome
```

IDs: `MV-NN` for work cards, `MV-AN` for approval-gated actions. IDs are stable and
used in commit messages.
