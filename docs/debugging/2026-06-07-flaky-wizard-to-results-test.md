# Flaky test fix: `wizard → results seam`

- **Date:** 2026-06-07
- **Branch:** `feat/conflict-gate`
- **Test:** `tests/integration/wizard-to-results.test.tsx` → _"produces a valid profile that assembles into a coherent payload"_
- **File changed:** `tests/integration/wizard-to-results.test.tsx` (test only — no production code)
- **Status:** Fixed and verified (full suite 5× green; isolation green)

## TL;DR

The test intermittently exceeded Vitest's default **5000 ms** timeout when run as part of the
full suite, but passed reliably in isolation. It was a **load-sensitive timing flake**, not a
logic failure. Root cause: `@testing-library/user-event`'s default `delay: 0` makes every
interaction await a real `setTimeout(0)` macrotask; under full-suite CPU contention those timer
callbacks fire late, and the lag compounds across the test's 15 sequential clicks until the tail
of the distribution crosses 5000 ms.

Fix (test file only):
1. `userEvent.setup({ delay: null })` — removes the load-sensitive real-timer waits.
2. An explicit `15000 ms` timeout on the `it(...)` as defense-in-depth.

No assertions were changed.

## Symptom

- `npx vitest run` (full suite): the test **intermittently** failed, appearing to exceed its
  implicit timeout.
- `npx vitest run tests/integration/wizard-to-results.test.tsx` (isolation): passed reliably.
- Passed on retry. Classic flake profile — fails under load, passes alone.

The test renders the full `<Wizard>` and drives 8 steps via sequential async `userEvent`
click-throughs (15 clicks total: 8 "Continue" + 7 radios), then asserts `onComplete` fired once
and the assembled payload is coherent.

## Root cause

### The mechanism

Every `userEvent` API call ends by awaiting an internal `wait(config)`. From
`node_modules/@testing-library/user-event/dist/esm/utils/misc/wait.js`:

```js
function wait(config) {
    const delay = config.delay;
    if (typeof delay !== 'number') return;            // delay: null → no wait at all
    return Promise.all([
        new Promise((resolve) => globalThis.setTimeout(() => resolve(), delay)), // delay: 0 → real setTimeout(0)
        config.advanceTimers(delay),
    ]);
}
```

`userEvent.setup()` defaults `delay` to `0` (a number), so **each** `await user.click()` parks on
a real `setTimeout(0)` macrotask — 15 of them in this test, plus internal pointer sub-events.

### Why that flakes under the full suite

- `vitest.config.ts` sets **no** `testTimeout` → Vitest default is **5000 ms**.
- `vitest.config.ts` sets **no** pool config → Vitest's default `forks` pool spawns roughly
  `cores − 1` workers. This machine has **12 cores** → ~11 workers competing for CPU.
- A `setTimeout(0)` callback only runs when its worker thread is scheduled by the OS and the
  macrotask queue is reached. With 11 workers time-slicing 12 cores, a worker is frequently
  descheduled, so each `setTimeout(0)` resolves *late*. The lag accumulates across 15 clicks.

The wizard itself is not the problem: it has **no** `setTimeout`/animation/`useEffect` —
each click is a pure synchronous `useState` update (`components/wizard/use-wizard-state.ts`,
`components/wizard/wizard.tsx`). The flake is entirely in the test harness's per-interaction
real-timer waits.

## Evidence (measured)

Duration of **this test** in different conditions:

| Condition | `delay` | Duration |
| --- | --- | --- |
| Isolation | `0` (default) | 970 ms |
| **Inside full suite** (149 files, ~11 workers) | `0` (default) | **3031 ms** |
| Isolation | `null` (fix) | 401 ms |

- The 3031 ms figure was from a *passing* run — already 3.1× the isolated baseline, and the tail
  of that distribution intermittently exceeds 5000 ms. That is the flake.
- Switching to `delay: null` in isolation dropped the test from 970 ms → 401 ms, i.e. **~59% of
  the wall-clock was the `setTimeout(0)` waits** — and that 59% is precisely the load-sensitive
  part. The remaining 401 ms is synchronous render + microtask work, which scales predictably and
  does not park on cross-worker OS timer scheduling.

## The fix

`tests/integration/wizard-to-results.test.tsx` — two changes, test file only:

```ts
// 1) Remove the load-sensitive real-timer waits (events still dispatch; React
//    still flushes synchronously inside each click, so behavior is identical).
const user = userEvent.setup({ delay: null });

// 2) Defense-in-depth: generous explicit timeout (default is 5000 ms) so even a
//    pathological contention spike on the remaining synchronous work cannot
//    re-trip the default — while still failing fast on a genuine hang.
it("produces a valid profile that assembles into a coherent payload", async () => {
  /* ... */
}, 15000);
```

### Why this is safe (no behavior change)

`delay` is purely a *delay between events* — not the flush mechanism. `userEvent.click()` already
wraps its work in `act()` and awaits the React re-render before resolving, so the DOM and event
handlers are up to date by the time each `await user.click()` returns, regardless of the trailing
`wait()`. Removing the delay removes idle waiting, not flushing. All events still dispatch.

### Assertions untouched

No assertions were weakened. In particular the grade-rescaling guard is intact:

```ts
expect(payload.matches.every((m) => m.matchLevel === "strong")).toBe(false);
```

## Verification

**Full suite, 5× consecutive runs** (`npx vitest run`):

| Run | Result | Timeouts | This test |
| --- | --- | --- | --- |
| 1 | 149 files / 538 tests passed | 0 | 619 ms |
| 2 | 149 files / 538 tests passed | 0 | 333 ms |
| 3 | 149 files / 538 tests passed | 0 | 743 ms |
| 4 | 149 files / 538 tests passed | 0 | 347 ms |
| 5 | 149 files / 538 tests passed | 0 | 879 ms |

- Under full-suite contention the test now runs in **333–879 ms** (was 3031 ms). Worst case is
  ~5.7× under even the old 5000 ms default and ~17× under the new 15000 ms ceiling. Variance also
  tightened — no more spikes toward the timeout.
- **Isolation:** still passes (296 ms).

## Alternatives considered (and why not)

- **Only raise the timeout.** Hides the load sensitivity instead of removing it; the test would
  still spend ~59% of its time in starved macrotask waits. Used only as a secondary safety margin.
- **Fake timers + `advanceTimers`.** More invasive; risks interaction with the React 19 scheduler
  and the `new Date(...)` calls in the test. Unnecessary once the real-timer waits are gone.
- **`findBy*` instead of `getBy*`.** Not applicable — every `getByRole` runs *after* an awaited
  click that already flushed the render, so there is no render in flight. `findBy*` would add its
  own real-timer polling, reintroducing timer dependence.
- **Reduce per-step work.** The test is already minimal (one action per step); cutting steps would
  weaken coverage of the wizard → profile → `assembleAssessment` seam.

## Unrelated note

While checking the working tree, `lib/scoring/academic.ts`, `lib/scoring/financial.ts`, and
`lib/scoring/visa.ts` showed unstaged modifications (the in-progress scoring-config wire-up to
`@/lib/data/scoring-config`, per commit `738697f`). These were **not** created or touched by this
fix and are left as-is. The 5× verification above ran with those edits already present in the tree,
so the test fix is verified against the branch's actual current state.
