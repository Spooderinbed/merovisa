# Visual & functional audit — full app walkthrough (2026-06-10)

**Method:** live preview walkthrough of every surface — marketing → 9-step wizard → anonymous
results → auth → signed-in shell via `/api/dev/sign-in` (dashboard, matches, plan, checklist,
profile, documents, guide) — on desktop and mobile viewports, plus a dark-mode probe and a
second wizard run choosing Canada. Interactive testing: plan Done/Dismiss/Undo with reload
persistence, profile edit (grade 72→85) saved through the API, shortlist toggle, document
upload (programmatic PNG as IELTS scorecard), document View endpoint, match-card links.
No console or server errors at any point.

**Dev-user state left mutated by the audit:** grade 85% + institution "Tribhuvan University",
one shortlist (`curtin-mit`), `ielts-trf.png` uploaded, plan items "Upload your IELTS report"
(done) and "Document your study gap reasons" (dismissed). Wipe the user and re-hit
`/api/dev/sign-in` to reseed.

---

## Agreed fix order

| # | Fix | Why here | Effort |
|---|-----|----------|--------|
| 1 | **Destination honesty** — kill the Canada → Australia silent swap; unsupported destinations either disabled ("coming soon — get notified") or results lead with an explicit "we don't cover Nepal → Canada yet; here's Australia" framing | Trust bug at the entry point; product's core promise broken on first contact | S–M |
| 2 | **Unify next-step engine with the plan** — dashboard reads from the plan; never invents its own "all caught up" | Trust bug inside the main promise ("what should I do next?"); dashboard and plan currently contradict each other | M |
| 3 | **Mobile navigation** — all six nav links are hidden at mobile width with no hamburger; avatar menu has only Dashboard/Profile/Sign out, so Matches/Plan/Documents/Guide are unreachable on phones. Recommend bottom tab bar | Critical usability for the actual market (phone-first Nepali students) | M |
| 4 | **Plan polish** — honest impact claims (no "could re-classify 62 matches" when the real number is ~0); explicit verified vs self-reported item types (system-verified items don't offer "Done"); clear visual distinction Done vs Dismissed; section counts update | Supports #2 — the unified engine needs trustworthy items | M |
| 5 | **Checklist step completion** — STEP rows (NOC, biometrics, police certificate) currently have no completion mechanism; checklist is permanently unfinished. Needs the plan/checklist responsibility split decided first | Depends on #2/#4 decisions | M |
| 6 | **Profile save feedback + live summary/ring update** — Save currently gives no confirmation; row summary and completeness ring stale until full reload | Users can't tell whether saves worked | S |
| 7 | **Tile link targets + journey stepper affordance** — DOCUMENTS tile (counts uploads) links to /checklist not /documents; SCHOLARSHIPS links to a stub tab; journey stepper is styled like tappable chips but fully inert | Misdirection in the shell | S |
| 8 | **CTA token fix + profile-strength empty expander + casing** — "Add details →" renders white-on-white in the dark next-step panel; Profile strength expands to zero content; "threshold for australia" lowercase enum leak; only Financial factor carries a verified·source line | Visible quality bugs | S |
| 9 | **Scholarships teaser / footer claim cleanup** — anonymous gate blur-teases "3 scholarships you may qualify for" while the signed-in tab says "coming next"; footer claims "checked daily" with no checker; Cost-estimate stub tab; "Guide landing in Phase 6" internal jargon in user copy | Over-promises that contradict the trust brand | S |
| 10 | **Profile editor consolidation** — 13 sections → ~8 (several are one field); replace the three "comma separated" free-text fields with chips/selects; "Grade system" select instead of free text; move "Intake" date from Personal info to Intended study | Friction, not breakage | M |

### Design note for #2 (decide before implementing)

- The plan is the **single prioritization brain**. Dashboard NEXT STEP = the plan's top open,
  actionable item. "All caught up" renders only when the plan has zero open items.
- Long-running items ("Season your bank statements — 6 months") need an
  **in-progress / waiting** state so the panel neither claims "caught up" nor nags an
  un-finishable item.
- Per item, define completion authority: **system-verified** (upload exists, profile field
  filled — no "Done" button) vs **self-reported** (steps like NOC — user marks done).
  This is the same split #4 and #5 build on.
- Repro of the contradiction: upload any document → dashboard says "All caught up — refresh
  your assessment whenever your profile changes" while the plan still shows three open
  high-impact items, including "Add proof of funds — single biggest lift for visa case
  strength". Also: "refresh your assessment" names a control that exists nowhere in the
  signed-in shell.

---

## Findings inventory

### Critical
- **C1 — Destination silent swap.** Wizard offers Australia, Canada, UK, Germany, USA, Ireland,
  "Not sure yet" with no data caveat. A Canada run returns a fully Australia-framed result:
  "CURRENT POLICY (NEPAL → AUSTRALIA)", DHA sources, Australian grant rates and intake dates,
  ten Australian university matches. Zero mentions of "Canada" on the page.
- **C2 — Next-step engine contradicts the plan.** See design note above.
- **C3 — Mobile navigation dead-end.** See fix #3.
- **C4 — Invisible primary CTA.** Dashboard NEXT STEP panel's "Add details →" renders
  `color: rgb(252,253,251)` on `background: rgb(252,253,251)` (token misuse inside the
  inverse/dark panel).

### High
- **H1 — Scholarship bait.** Anonymous results blur-tease "3 scholarships you may qualify
  for"; after sign-up the Scholarships tab says "coming next". Broken promise at the
  conversion moment.
- **H2 — "Checked daily" footer claim.** No freshness automation exists (see the 2026-06-10
  methodology review). Delete or build the checker.
- **H3 — Conflicting money signals.** Match card shows green "✓ Budget covers AUD 30,000
  tuition" while the dashboard calls the same budget "far short of ~AUD 74,210 — a major
  risk". Tuition-only vs total-cost framings collide; card check should use total first-year
  cost or be labeled "tuition only".
- **H4 — Anonymous results never say *why*.** Factor bars are inert on the anonymous results
  page (explanations exist signed-in only); verdict "Reach" sits unreconciled above
  mostly-positive factor labels and three "Strong match" cards. The single highest-value
  addition: a one-sentence "your binding constraint is X" block.
- **H5 — "Possible" band carries no information.** Strong (1) / Possible (62) / Reach (1) on a
  ~12,500 px page; the same corridor-constant line ("Genuine Student narrative + 6 months bank
  seasoning expected (Nepal AL3)") repeats on every card. Needs filters (city, budget fit,
  English fit), university grouping, visible within-band ordering, degree-level filtering
  (bachelor's-holder profile was shown 40+ Bachelor programs).
- **H6 — Steps can never be completed** (no checkboxes anywhere in checklist). See fix #5.
- **H7 — Dark mode specified but not implemented.** `prefers-color-scheme: dark` detected and
  ignored; CLAUDE.md/design-spec tokens unused. Implement or remove from spec.

### Medium
- **M1 — Wizard grade input contradicts the landing promise.** "Your grades in your own grade
  system" → wizard asks percentage only; NEB +2 uses 4.0 GPA; profile "Grade system" is free
  text; matches page itself cites a TU→WAM conversion table.
- **M2 — English = IELTS-only in the wizard** while profile (select), checklist ("IELTS
  scorecard (or PTE / TOEFL)"), documents vault (PTE/TOEFL tiles) and the data layer all
  support more.
- **M3 — Plan near-duplicates.** "Add evidence for your study gap" (high) vs "Document your
  study gap reasons" (medium) are the same job with different copy.
- **M4 — Shortlisting barely reacts.** Dashboard tile ticks and checklist picks the program
  up, but the plan never changes and no "Visa preparation" group appeared in any state
  produced during the audit.
- **M5 — Currency whiplash.** NPR lakh (wizard) → USD ranges (anonymous matches) → AUD
  (signed-in cards, requirements). Standardize on NPR + AUD with inline conversion.
- **M6 — Policy + cost mono-panels duplicated verbatim** on results and matches; on mobile
  they push the first match two screens down. Show once, collapse elsewhere.
- **M7 — Profile editor friction.** Save feedback (fix #6); three "comma separated" text
  fields; one-field sections; "Intake" misplaced; 13 accordions read as bureaucracy.
- **M8 — Status vocabulary collisions.** "English proficiency: Complete — report not
  uploaded"; anonymous "PROFILE ACCURACY 28% · Basic" vs signed-in ring "Solid";
  "Strong match" cards under a "Reach" verdict.
- **M9 — No way to re-run the assessment signed-in.** No control links back to /assess; the
  caught-up copy references a refresh that doesn't exist.
- **M10 — Document View is popup-fragile.** View fetches a signed URL (API 200) then relies on
  a JS-initiated open; popup blockers will eat it. Prefer inline preview or direct anchor.
- **M11 — Vault lacks NOC / police-certificate tiles** though checklist rows link "Upload in
  documents ↗" for them (they dead-end at "Other Document").

### Polish
- **P1** — "AUD 30,000–30,000 / yr" degenerate range; "(needs 7.)" trailing-dot artifact;
  dates like "2026-01-09" line-break mid-string on mobile.
- **P2** — Dashboard zeros on fresh accounts ("Universities 0", "Scholarships —") where a
  nudge belongs; "Recent updates" permanently empty (wire to ledger re-verification events —
  this is where the data-freshness lane meets the product).
- **P3** — Footer "Privacy" is a `/trust#privacy` anchor; a real policy page will be needed.
- **P4** — Wizard step 1 is a single-option question (Nepal); collapse to a confirmation chip.
- **P5** — Done items: counts don't decrement pre-reload; CLOSED group only forms after
  reload (inconsistent transition).

---

## Verified reactivity map

| Action | Dashboard | Plan | Matches | Profile | Checklist |
|---|---|---|---|---|---|
| Edit grade (72→85) | ✅ factor copy + bar | — | ✅ re-bands (Reach 1→0, Possible 62→63) | ⚠️ stale until reload | — |
| Upload document | ✅ tile + next-step | ❌ item stays open | — | ✅ "uploaded" | ✅ NEEDED→HAVE |
| Plan Done/Dismiss | ❌ next-step unchanged | ✅ persists, CLOSED group | — | — | — |
| Shortlist | ✅ tile | ❌ nothing | ✅ toggle persists | — | ✅ program appears |

Pattern: uploads and profile edits propagate well; plan and shortlist signals stop at their
own page.

## What works — do not regress

- **Wizard:** one question per screen, honest dynamic step count (8→9 when the gap step
  inserts), reassuring gap microcopy, NPR-lakh budget input with USD conversion,
  Continue disabled until valid.
- **Per-program checklist:** staged now / after-offer / visa-lodgement, NEEDED–RECOMMENDED–
  NOTE–STEP chips, `verified <date> · <source>` lines, Nepal-specific depth (MoEST NOC, NRB
  forex logic, VFS Kathmandu fee, OPCR). The product's moat.
- **Reactive scoring spine:** profile edit → factors, match bands, card copy all update;
  upload → vault, dashboard tile, profile status, checklist chip. Evidence-driven state.
- **Plan card anatomy:** impact rationale + time estimate + source-backed reasoning.
- **Match card threshold transparency:** "Your 85% meets the 60% minimum", "Budget below
  tuition by AUD 17,000".
- **Trust microcopy:** "not legal advice", "we don't blend exchange rates", VET-steering and
  visa-scam warnings, email-results-to-family capture.
- **Dev sign-in route:** multi-gated, random password per call, idempotent seeding.
