# MV-180 — Consultancy shell split + team-access correction

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-17

## Why

The signed-in chrome describes the actor as a student even while they process consultancy cases (journey marker, "My plan", student mobile tabs render inside `/workspace`). Slice ② of the workspace UI lane. **Spec:** `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md` §1 (signed-in shells) + §5, and preamble amendment 3.

## Scope

- Refactor `app/(app)/layout.tsx` into a neutral authenticated shell with student and consultancy layouts via route groups — public URLs unchanged.
- Consultancy shell: workspace top bar (mark, current org, switch-org, user affordance) + org rail (Day view / All cases / Team / owner-only Settings); compact horizontal row below `md`, no second bottom bar. Student chrome (AppBar journey marker, MobileTabBar, student footer) absent from workspace routes and vice versa.
- `/workspace` refits to auto-enter a sole active organization, stays a chooser for multiple, keeps the honest zero-org and lookup-failed states.
- **Fix the team-page access bug (Codex finding, verified in spec §0):** the team page currently gates the counsellor's matrix-permitted read-only view behind `org.manage` (cell 4 vs cell 5). Restore counsellor read-only team access; mutation stays owner/admin.
- `TeamMemberRow` refits to a dense roster row using `StaffReference` (role + truncated id — F-9 stands, no names exist).

## Acceptance criteria

1. No student journey UI on any workspace route; no org rail on any student route; both proven by shell tests.
2. Sole-org actor lands on the Day view without the chooser; multi-org and zero-org behavior unchanged.
3. A counsellor can READ the team roster; mutation affordances stay omitted-and-denied for them (route re-decides, not just presentation).
4. Org switching keeps tenant clarity (current org always visible in the top bar).
5. Gate green + live browser pass covering dashboard→workspace and workspace→dashboard navigation.

## Test plan

Per spec §7 PR 2: shell-presence/absence tests both directions; role tests for team read vs team mutation (mutation-test the fix — a denial-only probe is inert, MISTAKES.md: testing); active/inactive membership + switching tests.

---

## Evidence (2026-08-17, branch `mv-180-consultancy-shell`)

**Gate:** `npm test` 3332 passed / 362 files · `npm run typecheck` clean · `npm run lint` clean.
No database evidence is claimed from this machine — there is no local Supabase stack here, and the slice ships no SQL. The gating CI `integration` job covers the DB side.

### What shipped

| Concern | Where |
|---|---|
| Neutral auth shell | `app/(app)/layout.tsx` — auth gate + corridor scope only |
| Student shell | `app/(app)/(student)/layout.tsx` + 10 page files moved into the group (URLs unchanged) |
| Consultancy shell | `app/(app)/workspace/layout.tsx` + `components/workspace/workspace-top-bar.tsx` |
| Org band + rail | `app/(app)/workspace/[organizationId]/layout.tsx` + `components/workspace/org-rail.tsx` |
| Sole-org auto-enter | `app/(app)/workspace/page.tsx` |
| Cell-4 read fix | `app/(app)/workspace/[organizationId]/team/page.tsx` |
| Dense roster row | `components/workspace/team-member-row.tsx` (required `canManage`, built on `StaffReference`) |
| Orphan cleanup | Day view / All cases / Settings headers lost their org-level links — the rail carries them now |

### Acceptance criteria

1. **Both directions, twice over.** `tests/app/shell-split.test.tsx` (18 tests) asserts every absence with the *same query* that a sibling test proves reachable — the student shell finds `data-testid="appbar"`, which is what makes the workspace shell's `queryByTestId("appbar") === null` mean something; the org rail does it in reverse. `tests/architecture/shell-boundary.test.ts` is the static half — it also fails first if the route groups vanish, so it cannot pass by scanning nothing.
2. **Auto-enter** — `workspace-pages.test.tsx`: sole active org redirects to `/workspace/<id>`; multi-org renders the chooser and does not redirect; zero-org and `lookup-failed` neither redirect nor claim the other's sentence.
3. **Counsellor reads, does not write** — roster renders for a counsellor, with no `combobox` and no Deactivate/Reactivate; an admin gets both (the pair, so "no controls" cannot pass against a page that renders controls for nobody). The mutation route `/api/org/[id]/members/[id]` already re-decides on `org.manage` independently (`tests/api/org-routes.test.ts`: "403s a counsellor, and never reads the membership row").
4. **Tenant clarity** — the org band names the organization on every route inside it; "Switch organization" renders only when `result.data.length > 1`.
5. **Live pass** below.

### Mutation tests (the fix bites in both directions)

| Mutation | Result |
|---|---|
| Team read gate reverted to `!manage.decision.allowed` (the original bug) | **3 tests fail** — the counsellor read, the absent controls, the read-only copy |
| Team standing gate removed (`membershipRole === undefined`) | **2 tests fail** — the non-member and the inactive member both reach the roster |
| `MobileTabBar` imported into `app/(app)/workspace/layout.tsx` | **shell-boundary fails** with the offending path named |

### Live browser pass

No Supabase credentials on this machine, so the real routes cannot be driven. A temporary harness (`app/mv180-harness/**`, **deleted before committing**) rendered the real `WorkspaceTopBar` / `OrgRail` / `TeamMemberRow` and, on a second route, the real student chrome, so the two shells were compared live rather than only in jsdom.

| Measurement | Consultancy shell | Student shell |
|---|---|---|
| Landmarks | one `banner`, one `main`, `navigation "Organization"` | `banner`, `main`, `navigation "Primary"` |
| Journey marker | absent | present ("Plan · step 4 of 6") |
| "My plan" nav | absent | present |
| Footer | absent | present |
| `position: fixed` elements | **0** | **1** (the mobile tab bar) |
| Org rail | Day view / All cases / Team / Settings | absent |

- 1280×720 and 375×812: **no horizontal page overflow** either width. At 375 the rail scrolls inside itself (339 > 335) rather than widening the page, and there is no second fixed bottom bar.
- Chrome heights: top bar 67px, org band 59px desktop / 119px at 375 (name + switch wrap above the rail).
- Roster rows: 47px read-only, 96px with controls at 375 — dense, no overflow.
- Rail links pass WCAG AA in both themes: **6.2:1** light (`#5c5058` on `#ece7dc`), **7.0:1** dark (`#aaa0a8` on `#1c161b`), verified on a fresh load in each theme.

### Deviations from the spec, recorded rather than silent

1. **The rail is one horizontal row at every width**, not a vertical rail above `md` (spec §1). A vertical rail has to own the content column's grid, and every workspace page currently centres its own `max-w-[1120px] px-5` container — re-homing all of them (Day view, All cases, Team, Settings, and every `[caseId]` route) belongs with MV-181's case-frame refit, not here. The spec's actual requirement below `md` — a compact horizontal link row, no second fixed bottom bar — holds, and is measured above.
2. **The organization's name is in the band directly beneath the top bar, not inside the bar itself** (spec §1). A parent layout cannot read a child segment's `params`, so the segment that owns `[organizationId]` is the only one that can name the tenant. The bar and the band are one chrome block (bar has the border, band has the tint), and AC 4 — the current org visible on every org route — holds.

### Follow-ups found, not fixed here

- **Nothing links a signed-in student to `/workspace`.** Staff reach the workspace by typing the URL; the way back out is the user-pill menu. Pre-existing since MV-169 — AC 5 was read as a chrome-correctness claim, which is what the spec's PR-2 test line asks for. A staff entry point needs a membership read on every student page, so it wants its own card.
- The Day view / All cases / Settings pages render a `<header>` inside `<main>`, which Chrome's a11y tree reports as a second `banner`. Pre-existing on master, unchanged by this slice.
- `components/layout/logo.tsx` still reads "MyVisa" — the rename sweep is its own lane.

## Resume notes

Branch `mv-180-consultancy-shell` off master after MV-179 merges (the rail's "Day view" target must exist). Independent of Stage 4/5 — no data dependencies.

**Next:** MV-181 is the case-frame REFIT delta only — MV-172 already built that shell (spec amendment 1). It is also the natural home for deviation 1 above: if the case frame moves to an owned content grid, the org rail can become vertical at `md` in the same pass.
