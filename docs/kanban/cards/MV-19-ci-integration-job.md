# MV-19 — Wire `test:integration` into CI (real-DB claim-path smoke runs on GitHub)

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Gate:** human (founder — confirm the CI run goes green on GitHub; decide required-vs-advisory)
**Created:** 2026-06-21 · **Entered review:** 2026-06-21
**Related:** [[MV-18]] — built the smoke + raised the open question "wire `test:integration` into CI later, or keep it a local pre-merge gate." This card answers it: wired in, as a separate advisory job. [[MV-16]] — the regression class the smoke guards.

## Why

[[MV-18]] shipped `tests/integration/claim-path.itest.ts` — a real-DB smoke that
catches the swallowed partial-unique-index class of bug (the [[MV-16]] dashboard
pin) that mocked unit tests structurally cannot. But it only ran when an operator
manually brought up a local Supabase stack and set env vars. Nothing enforced it on
push, so the protection could silently rot. This card runs it in CI on every push /
PR to `main`/`master`.

## What shipped

- **`.github/workflows/ci.yml`** — new second job `integration` (parallel to the
  existing `validate` job), `ubuntu-latest`, `timeout-minutes: 20`,
  `continue-on-error: true` (advisory; see Decision log):
  1. checkout → setup-node 20 (npm cache) → `npm ci` (brings up the `supabase`
     devDependency, so `npx supabase` resolves the local binary — no network DL).
  2. `npx supabase start` — full stack (Postgres + GoTrue + PostgREST), applies all
     14 migrations in `supabase/migrations/`, reads `config.toml`
     (`auto_expose_new_tables = true`).
  3. Export step: `npx supabase status -o env > supabase.env`, source it, and emit
     `SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY` to `$GITHUB_ENV` —
     **defensively** (`SUPABASE_URL`/`SUPABASE_API_URL`, `SUPABASE_SECRET_KEY`/
     `SUPABASE_SERVICE_ROLE_KEY`) so a CLI key rename can't silently leave them unset.
  4. Run step **asserts the suite actually executed** — env vars non-empty + a REST
     health probe + grep the verbose summary for `>0 passed` and `0 skipped`. This
     closes the false-green hole: the smoke `describe.skipIf(!url||!key)`s, so a
     silent env-export failure would otherwise green CI having tested nothing.
  5. `npx supabase stop --no-backup` under `if: always()`.
- `validate` job unchanged.

## Codex review (per the autonomous-operating-model "decide with Codex")

GPT-5 adversarial pass on the proposed YAML — verdict **ship-with-changes**, 3 fixes
folded before commit: (a) defensive dual-key env extraction instead of a single
fixed `--override-name`; (b) `continue-on-error: true` until the flake rate is known;
(c) the env-presence + health-probe + skip-assertion guard around the test step.
Confirmed-PASS by Codex: `$GITHUB_ENV` reaches later steps; stock `ubuntu-latest`
has Docker for `supabase start` (no `setup-cli`/buildx needed).

## Acceptance criteria

- [x] `ci.yml` parses (validated: jobs `validate` + `integration`, 7 steps).
- [x] Integration job runs `npm run test:integration` against a real `supabase start`
      stack, not mocks.
- [x] Guard asserts the suite ran (no silent all-skipped false-green).
- [x] Advisory (`continue-on-error`) — does not block merges until flake measured.
- [ ] **Founder-owed:** observe the first GitHub Actions run go green (agent can't —
      `gh` unauthed here, no Actions visibility); then decide required-vs-advisory
      via branch protection.

## Integration gate

- `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → parses.
- No TS touched → `typecheck`/`lint`/`npm test` unaffected (the smoke itself was
  proven RED→GREEN locally in [[MV-18]]; this card only schedules it).
- True end-to-end proof = the job running on GitHub on the next push (founder-owed).

## Risk notes

- **Cannot be locally executed here**: Docker daemon is down + `gh` is unauthed, so
  the *workflow's own* green is unproven until it runs on GitHub. The underlying test
  is proven (MV-18); the YAML is Codex-vetted + parse-valid. Honest status: shipped,
  not yet observed-green on CI.
- **Cost/flakiness**: `supabase start` pulls Docker images (slow cold start). Kept
  advisory + isolated in its own job so it never blocks the fast lane. No layer
  caching added speculatively (Codex: measure flake first).

## Decision log

- 2026-06-21 — Separate `integration` job, not a step in `validate`: the Docker
  startup is slow and must not gate typecheck/lint/test feedback. Parallel, not
  `needs:`.
- 2026-06-21 — Advisory (`continue-on-error: true`) for now; promote to a required
  check via branch protection once a few runs confirm it isn't flaky. (Codex rec.)
- 2026-06-21 — Folded Codex's 3 fixes (dual-key extraction, advisory, skip-assertion
  guard) — the skip-assertion is the important one: without it the env-gated smoke
  could green CI while testing nothing.

## Done evidence

- `.github/workflows/ci.yml` edited; YAML parse-validated (2 jobs, integration job
  7 steps). Codex GPT-5 review: ship-with-changes, all 3 changes applied.
- Committed to master (see commit in board). Founder observes the first Actions run.
