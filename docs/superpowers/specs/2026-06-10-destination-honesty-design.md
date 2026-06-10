# Destination honesty — design spec (2026-06-10)

**Slice type:** pure product/trust slice (no data, no scoring). Fix #1 from
`docs/audits/2026-06-10-visual-audit-and-fix-order.md` (finding C1).

## Problem

The wizard offers six destinations (Australia, Canada, UK, Germany, USA, Ireland) plus
"Not sure yet" with no coverage caveat. Only Nepal → Australia is implemented.
`lib/results/assemble.ts` resolves **every** corridor to Australia data; a user who picks
Canada receives a fully Australia-framed assessment (DHA policy panel, Australian grant
rates, Australian matches) with zero acknowledgment — the audit run found the word "Canada"
appears nowhere on the page. The assemble.ts comment claims a "more countries coming" UI
note that was never built.

## Requirements (user-set, 2026-06-10)

1. The wizard destination step must not imply Canada/UK/Germany/USA/Ireland are supported.
2. Unsupported destinations are disabled or clearly marked "coming soon" (we do both).
3. If a user somehow reaches results with an unsupported destination, results must NOT
   silently show Australia. They must say "We don't support Nepal → Canada yet."
   An Australia readout is shown only on explicit choice.
4. No scoring change unless needed (it is not needed).
5. Tests cover unsupported destination selection and the no-silent-fallback guarantee.

## Decisions & assumptions

- **Source of truth:** `SUPPORTED_DESTINATIONS = ["australia"]` + `isDestinationSupported()`
  exported from `lib/scoring/types.ts`, next to the existing `DESTINATIONS` enum. Adding
  exports changes no scoring behavior; goldens must stay byte-identical.
- **"Not sure yet — help me decide" stays selectable.** Choosing it is explicit delegation,
  so results render normally **plus** an explicit framing notice ("Australia is the only
  corridor we fully cover today…"). This satisfies "Australia preview only if explicitly
  chosen" — the user delegated the choice; we say out loud how we resolved it.
- **Wizard:** the five unsupported options render disabled with a "Coming soon" description;
  step subtext states coverage honestly. `isStepComplete("destination")` additionally
  rejects unsupported values (protects against stale drafts/state).
- **API defense in depth:** `/api/assess` returns 422 for unsupported destinations after
  schema parse. `ProfileSchema` itself is NOT narrowed (stored snapshots with legacy values
  must continue to parse elsewhere).
- **Results gate:** `Results` gains a required `destination: Destination` prop.
  - unsupported → render an `UnsupportedDestinationNotice` INSTEAD of the assessment
    (no verdict, no AU panels), with one CTA linking to `/assess?new=1` ("See where you
    stand for Australia →") — restarting the wizard is the explicit choice.
  - `"not-sure"` → normal results with the framing notice above the verdict.
  - `"australia"` → unchanged.
  - Call sites: `AssessFlow` passes `profile.destination`; `app/(focused)/assessment/[id]`
    passes `row.destination_id` (covers legacy stored rows).

### Copy (exact)

- Wizard step subtext: `We fully cover Nepal → Australia today — more destinations are on the way. Pick Australia, or let us show you where you fit best.`
- Disabled option description: `Coming soon`
- Unsupported notice — eyebrow `DESTINATION COVERAGE`; heading
  `We don't cover Nepal → {Country} yet.`; body
  `We only publish guidance we can verify against official sources, and {Country} isn't there yet. Australia is the corridor we fully cover today.`;
  CTA `See where you stand for Australia →` → `/assess?new=1`.
- Not-sure framing notice — eyebrow `DESTINATION`; body
  `You asked us to suggest a destination. Australia is the only corridor we fully cover today, so this readout shows where you stand for Nepal → Australia.`

## Out of scope (noted for follow-up)

- Profile destination editor (`components/profile/editors/destination-editor.tsx`) still
  lists all six (and uses `"us"` where scoring uses `"usa"` — latent mismatch). Separate
  surface, separate slice.
- Dashboard standing panel for hypothetical legacy non-Australia primary assessments —
  pre-launch there are none, and the API guard prevents new ones.
- Scoring engine multi-destination behavior (`tests/scoring/multi-destination.test.ts`
  mirrors floors) — untouched.

## Gate (product-slice)

Empty diff under `docs/research-briefs/` and `lib/data/source/`;
`tests/scoring/__fixtures__/golden-assessments.json`, `lib/scoring/financial.ts`,
`lib/data/policy/funding-reliability.ts` all untouched; typecheck + lint + full vitest green.
WIP trio (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`)
never staged.
