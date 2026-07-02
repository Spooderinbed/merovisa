# MV-81 — CI integration job env mapping fix (renamed Supabase CLI status output)

**Source:** 2026-07-02 process retro — the `integration` job in `.github/workflows/ci.yml`
has failed on every run for ~10 days, and because the job is `continue-on-error: true`
(advisory, not required), nobody noticed: an always-red job trains red-blindness and stops
being a signal at all.

**Root cause (evidence from run 28576388321):** the "Run integration smoke" step's own env
block shows both vars empty:

```
env:
  SUPABASE_TEST_URL:
  SUPABASE_TEST_SERVICE_ROLE_KEY:
```

so the first line, `test -n "$SUPABASE_TEST_URL"`, exits 1 immediately. The prior "Export
Supabase test env" step sources `npx supabase status -o env` output and maps
`${SUPABASE_URL:-${SUPABASE_API_URL:-}}` / `${SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}`
— but current Supabase CLI versions emit **unprefixed** variable names in `-o env` output
(e.g. `API_URL`, `SERVICE_ROLE_KEY`, and newer key-format names like `SECRET_KEY`), so every
fallback in the chain misses and empty strings get written to `$GITHUB_ENV`. The step silently
"succeeds" (both vars set to `""`) and the failure only surfaces two steps later, unlabelled.

## Fix

In `.github/workflows/ci.yml`, "Export Supabase test env" step only:

- Extended both fallback chains to include the unprefixed names:
  - URL: `${SUPABASE_URL:-${SUPABASE_API_URL:-${API_URL:-}}}`
  - KEY: `${SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}}}`
- Added a fail-fast guard in the same step: if either resolved value is empty, print a clear
  `::error::` message plus the variable **names** actually present in `supabase.env`
  (`cut -d= -f1 supabase.env | sort` — names only, never values, even though the file itself
  holds keys/secrets) and `exit 1`. A future CLI rename now fails loudly, right where the
  mapping happened, with the exact names needed to extend the chain again — instead of a
  silent empty-env limping two steps downstream into an unlabelled `test -n` failure.
- Extended the step's existing explanatory comment (it already anticipated CLI renames) to
  match the new fallback chain and the fail-fast behaviour.
- Nothing else in the file touched: `continue-on-error: true` on the job, the `validate` job,
  and every other step are unchanged.

## Acceptance criteria

- [ ] The "Export Supabase test env" step fails fast (`exit 1`) with a names-only diagnostic
  when the URL/key mapping misses, instead of writing empty strings to `$GITHUB_ENV`.
- [ ] On this PR's own CI run, the `integration` job reaches the "Run integration smoke" step
  with non-empty `SUPABASE_TEST_URL` / `SUPABASE_TEST_SERVICE_ROLE_KEY`. **Verification happens
  on the PR's own Actions run, not locally** — Docker/Supabase CLI aren't available in this
  worktree to reproduce the job locally.
- [ ] No other line in `.github/workflows/ci.yml` changed (diff scoped to the one step + its
  comment).

## Notes

- This card documents the fix; it does not flip to Done until the PR's own integration run is
  observed reaching the smoke step with a populated env (founder or next agent to confirm from
  the Actions tab, then move the card).
