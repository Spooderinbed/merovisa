# Context Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project-local Claude Code hook that nudges toward a focused `/compact` once context occupancy crosses a calibrated threshold, plus a skill documenting the policy and how to write a good compaction hint.

**Architecture:** A `UserPromptSubmit` hook runs a Node script each turn. The script reads the transcript's most recent assistant `usage`, computes occupancy against a fixed 200k effective budget, resolves a Safe/Soft/Hard tier, debounces via a per-session state file, and (when over threshold) emits `additionalContext` recommending a hinted `/compact`. A companion skill holds the policy and hint-craft.

**Tech Stack:** Node.js ESM (`.mjs`), Node's built-in test runner (`node:test`), Claude Code hooks schema (`.claude/settings.json`).

**Spec:** `docs/superpowers/specs/2026-06-18-context-budget-design.md`

---

## Conventions for this plan

- All paths are relative to the repo root `C:/Users/thapa/OneDrive/Desktop/work/merovisa`.
- Run all commands from the repo root.
- These tests use `node --test` and are **deliberately not** part of `npm test` (vitest) — they test repo infrastructure, not the app.
- Commit messages follow the repo's conventional-commit style (`feat(...)`, `chore(...)`).

---

### Task 1: Hook script (tier logic + IO), test-first

**Files:**
- Create: `.claude/hooks/context-budget.test.mjs`
- Create: `.claude/hooks/context-budget.mjs`

- [ ] **Step 1: Write the failing test file**

Create `.claude/hooks/context-budget.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveTier,
  occupancyFromLines,
  shouldEmit,
  buildReminder,
  TIER,
} from './context-budget.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'context-budget.mjs');

// A transcript line shaped like a Claude Code assistant turn.
function usageLine(total) {
  return JSON.stringify({
    type: 'assistant',
    message: {
      usage: {
        input_tokens: total,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 100,
      },
    },
  });
}

// --- pure: resolveTier ---
test('resolveTier: 40k tokens => SAFE', () => {
  assert.equal(resolveTier(40_000), TIER.SAFE);
});
test('resolveTier: 80k tokens => SOFT', () => {
  assert.equal(resolveTier(80_000), TIER.SOFT);
});
test('resolveTier: 130k tokens => HARD', () => {
  assert.equal(resolveTier(130_000), TIER.HARD);
});

// --- pure: occupancyFromLines ---
test('occupancyFromLines: returns latest assistant usage sum', () => {
  const lines = [usageLine(10_000), usageLine(80_000), ''];
  assert.equal(occupancyFromLines(lines), 80_000);
});
test('occupancyFromLines: sums input + cache tokens', () => {
  const line = JSON.stringify({
    message: { usage: { input_tokens: 1_000, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 9_000 } },
  });
  assert.equal(occupancyFromLines([line]), 60_000);
});
test('occupancyFromLines: no usage anywhere => null', () => {
  assert.equal(occupancyFromLines(['{"type":"user"}', 'not json', '']), null);
});

// --- pure: shouldEmit (debounce) ---
test('shouldEmit: SAFE never emits', () => {
  assert.equal(shouldEmit(TIER.SAFE, TIER.SAFE), false);
});
test('shouldEmit: SOFT emits only on escalation from SAFE', () => {
  assert.equal(shouldEmit(TIER.SOFT, TIER.SAFE), true);
  assert.equal(shouldEmit(TIER.SOFT, TIER.SOFT), false);
});
test('shouldEmit: HARD always emits (urgent)', () => {
  assert.equal(shouldEmit(TIER.HARD, TIER.HARD), true);
  assert.equal(shouldEmit(TIER.HARD, TIER.SAFE), true);
});

// --- pure: buildReminder ---
test('buildReminder: mentions /compact and the percent', () => {
  const r = buildReminder(TIER.SOFT, 80_000);
  assert.match(r, /\/compact/);
  assert.match(r, /40%/);
});
test('buildReminder: HARD wording differs from SOFT', () => {
  assert.notEqual(buildReminder(TIER.HARD, 130_000), buildReminder(TIER.SOFT, 80_000));
});

// --- integration: full script via stdin/stdout ---
function runHook(payload, projectDir) {
  return spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
}

function tempProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ctxbud-'));
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  return dir;
}

test('integration: HARD transcript emits additionalContext, exit 0', () => {
  const dir = tempProject();
  const transcript = path.join(dir, 't.jsonl');
  writeFileSync(transcript, usageLine(130_000) + '\n');
  const res = runHook({ transcript_path: transcript, session_id: 's1', cwd: dir }, dir);
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /\/compact/);
  rmSync(dir, { recursive: true, force: true });
});

test('integration: SAFE transcript emits nothing, exit 0', () => {
  const dir = tempProject();
  const transcript = path.join(dir, 't.jsonl');
  writeFileSync(transcript, usageLine(40_000) + '\n');
  const res = runHook({ transcript_path: transcript, session_id: 's1', cwd: dir }, dir);
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
  rmSync(dir, { recursive: true, force: true });
});

test('integration: SOFT debounces on repeat within same session', () => {
  const dir = tempProject();
  const transcript = path.join(dir, 't.jsonl');
  writeFileSync(transcript, usageLine(80_000) + '\n');
  const first = runHook({ transcript_path: transcript, session_id: 's2', cwd: dir }, dir);
  assert.notEqual(first.stdout.trim(), ''); // first SOFT emits
  const second = runHook({ transcript_path: transcript, session_id: 's2', cwd: dir }, dir);
  assert.equal(second.stdout.trim(), '');   // repeat SOFT is silent
  rmSync(dir, { recursive: true, force: true });
});

test('integration: missing transcript path => exit 0, no output', () => {
  const dir = tempProject();
  const res = runHook({ session_id: 's1', cwd: dir }, dir);
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --test .claude/hooks/context-budget.test.mjs`
Expected: FAIL — module load error (`Cannot find module '.../context-budget.mjs'`).

- [ ] **Step 3: Implement the hook script**

Create `.claude/hooks/context-budget.mjs`:

```js
#!/usr/bin/env node
// context-budget hook — nudges toward a focused /compact before context rot.
// Registered as a Claude Code UserPromptSubmit hook. Policy: .claude/skills/context-budget/SKILL.md
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Tunables — calibrated to where context rot bites, not to the real window.
export const EFFECTIVE_BUDGET = 200_000; // tokens
export const SOFT_FRACTION = 0.30;       // 60k
export const HARD_FRACTION = 0.60;       // 120k

export const TIER = { SAFE: 0, SOFT: 1, HARD: 2 };

export function resolveTier(tokens, budget = EFFECTIVE_BUDGET) {
  const frac = tokens / budget;
  if (frac >= HARD_FRACTION) return TIER.HARD;
  if (frac >= SOFT_FRACTION) return TIER.SOFT;
  return TIER.SAFE;
}

// Scan transcript lines from the end for the most recent assistant `usage`,
// returning total occupancy (input + cache_read + cache_creation), or null.
export function occupancyFromLines(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const usage = obj?.message?.usage ?? obj?.usage;
    if (usage && typeof usage.input_tokens === 'number') {
      return (usage.input_tokens || 0)
        + (usage.cache_read_input_tokens || 0)
        + (usage.cache_creation_input_tokens || 0);
    }
  }
  return null;
}

export function buildReminder(tier, tokens, budget = EFFECTIVE_BUDGET) {
  const pct = Math.round((tokens / budget) * 100);
  const k = Math.round(tokens / 1000);
  if (tier === TIER.HARD) {
    return `[context-budget] Context ~${pct}% of working budget (${k}k tokens) — past the safe zone. `
      + `Recommend the user run a focused \`/compact <keep…, drop…>\` now, regardless of task, before continuing. `
      + `See the context-budget skill for hint-craft. Don't let autocompact fire.`;
  }
  return `[context-budget] Context ~${pct}% of working budget (${k}k tokens) — entering the degradation zone. `
    + `If this task is simple or nearly done, fine to continue; otherwise recommend the user run a focused `
    + `\`/compact <keep…, drop…>\`. See the context-budget skill.`;
}

// Emit on escalation; always re-emit while HARD (urgent); never repeat SOFT.
export function shouldEmit(tier, lastTier) {
  if (tier === TIER.SAFE) return false;
  if (tier === TIER.HARD) return true;
  return tier > lastTier;
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function stateFile(projectDir) {
  return path.join(projectDir, '.claude', '.context-budget-state.json');
}

function readState(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { return { sessionId: null, lastTier: TIER.SAFE }; }
}

function writeState(file, state) {
  try { writeFileSync(file, JSON.stringify(state)); } catch { /* non-fatal */ }
}

export function main() {
  let payload;
  try { payload = JSON.parse(readStdin()); } catch { return; } // always exit 0
  const transcriptPath = payload?.transcript_path;
  if (!transcriptPath) return;

  let lines;
  try { lines = readFileSync(transcriptPath, 'utf8').split('\n'); }
  catch { return; }

  const tokens = occupancyFromLines(lines);
  if (tokens == null) return;

  const tier = resolveTier(tokens);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || '.';
  const file = stateFile(projectDir);
  const prev = readState(file);
  const lastTier = prev.sessionId === payload?.session_id
    ? (prev.lastTier ?? TIER.SAFE)
    : TIER.SAFE;

  // Persist current tier so a later drop to SAFE (post-compact) resets debounce.
  writeState(file, { sessionId: payload?.session_id ?? null, lastTier: tier });

  if (!shouldEmit(tier, lastTier)) return;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: buildReminder(tier, tokens),
    },
  }));
}

const invokedDirectly = process.argv[1]
  && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (invokedDirectly) main();
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --test .claude/hooks/context-budget.test.mjs`
Expected: PASS — all unit + integration tests green (`# pass <n>`, `# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/context-budget.mjs .claude/hooks/context-budget.test.mjs
git commit -m "feat(hooks): add context-budget tier logic + compaction nudge"
```

---

### Task 2: Register the hook and ignore the state file

**Files:**
- Create: `.claude/settings.json`
- Modify: `.gitignore` (append one line)

- [ ] **Step 1: Create the hook registration**

Create `.claude/settings.json` (this is the shared, committed settings file — it does not exist yet; `settings.local.json` holds local permissions and stays untouched):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/context-budget.mjs\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify settings.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('settings.json OK')"`
Expected: prints `settings.json OK`.

- [ ] **Step 3: Ignore the per-session state file**

Append this line to `.gitignore` (create the entry under a short comment; do not duplicate if already present):

```
# context-budget hook session state
.claude/.context-budget-state.json
```

- [ ] **Step 4: End-to-end smoke test via the registered command**

Simulate the exact invocation Claude Code performs, using a real-shaped payload and a temp transcript at 130k tokens:

Run (PowerShell):
```powershell
$dir = New-Item -ItemType Directory -Force "$env:TEMP\ctxbud-smoke"; New-Item -ItemType Directory -Force "$dir\.claude" | Out-Null
'{"type":"assistant","message":{"usage":{"input_tokens":130000,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}' | Set-Content "$dir\t.jsonl"
$env:CLAUDE_PROJECT_DIR = "$dir"
('{"transcript_path":"' + ("$dir\t.jsonl" -replace '\\','\\') + '","session_id":"smoke","cwd":"' + ($dir.FullName -replace '\\','\\') + '"}') | node .claude/hooks/context-budget.mjs
```
Expected: prints a JSON object containing `"hookEventName":"UserPromptSubmit"` and an `additionalContext` string mentioning `/compact`.

- [ ] **Step 5: Commit**

```bash
git add .claude/settings.json .gitignore
git commit -m "feat(hooks): register context-budget UserPromptSubmit hook"
```

---

### Task 3: The context-budget skill

**Files:**
- Create: `.claude/skills/context-budget/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `.claude/skills/context-budget/SKILL.md`:

```markdown
---
name: context-budget
description: Use when context is filling up or when deciding whether and how to /compact — the policy for keeping context below the degradation ("dumb zone") threshold and how to write a focused /compact hint. Project-local to merovisa.
---

# Context Budget

Result quality degrades as the context window fills ("context rot"). The model is
at its **least** capable exactly when autocompact fires, because that happens at
peak occupancy. A **hinted, manual** `/compact` issued earlier preserves the live
thread and drops resolved tangents — always better than a blind autocompact.

A `UserPromptSubmit` hook (`.claude/hooks/context-budget.mjs`) measures occupancy
each turn and injects a reminder when you cross a threshold. This skill is the
policy behind that reminder.

## Thresholds

Measured against a **200k-token effective working budget** (not this session's
real window — a literal fraction of a 1M window would fire far too late).

| Tier | Tokens | % of budget | What to do |
|------|--------|-------------|------------|
| Safe | < 60k  | < 30%       | Nothing. Keep working. |
| Soft | 60k–120k | 30–60%    | If the task is **simple or nearly done**, keep going. Otherwise recommend the user run a focused `/compact`. |
| Hard | ≥ 120k | ≥ 60%       | Recommend a focused `/compact` **now**, regardless of task. |

You cannot run `/compact` yourself — recommend it clearly and hand the user the
exact hint to type.

## How to write a focused /compact hint

A good hint names what to **keep** and what to **drop**:

- **Keep:** the current goal, decisions already made, the working state of files
  you're mid-change on, the acceptance criteria.
- **Drop:** resolved sub-threads, finished debugging, dead-end exploration, and
  verbose tool output you've already acted on.

Template:

    /compact focus on <the live task / what to keep>, drop <the resolved tangents>

Worked example:

    /compact focus on the auth refactor, drop the test debugging

## When NOT to compact

- **Mid-edit** — finish the current file change first; compacting can lose the
  exact state you're working against.
- **Right before a verification** that needs the full current context (e.g. you're
  about to reason over a long diff or test output you just produced).

## The principle

A hinted manual `/compact` > autocompact, every time. Nudge early, compact with
intent, never let autocompaction decide for you at peak context.
```

- [ ] **Step 2: Verify the skill frontmatter parses**

Run: `node -e "const s=require('fs').readFileSync('.claude/skills/context-budget/SKILL.md','utf8'); const m=s.match(/^---\n([\s\S]*?)\n---/); if(!m) throw new Error('no frontmatter'); if(!/name:\s*context-budget/.test(m[1])) throw new Error('bad name'); if(!/description:/.test(m[1])) throw new Error('no description'); console.log('SKILL.md frontmatter OK')"`
Expected: prints `SKILL.md frontmatter OK`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/context-budget/SKILL.md
git commit -m "feat(skills): add context-budget compaction policy skill"
```

---

### Task 4: Final wiring verification

No new files — confirm the whole feature works end-to-end.

- [ ] **Step 1: Run the full hook test suite**

Run: `node --test .claude/hooks/context-budget.test.mjs`
Expected: PASS, `# fail 0`.

- [ ] **Step 2: Confirm the app test suite is unaffected**

Run: `npm test`
Expected: the existing vitest suite runs and passes as before; the `node --test` files under `.claude/` are **not** picked up by vitest (they live outside the configured test roots). If vitest *does* try to collect them, add `.claude/**` to vitest's `exclude` and note it here.

- [ ] **Step 3: Manual reload check (human step)**

In the Claude Code session, run `/hooks` (or restart the session) so the new
`.claude/settings.json` hook is loaded. Confirm no hook errors are reported on the
next prompt submit. (This step is manual; it cannot be scripted.)

- [ ] **Step 4: (Optional) CLAUDE.md pointer**

Only if desired: add a one-line note under a suitable section of `CLAUDE.md`
pointing at the policy, e.g. `- Context hygiene: see .claude/skills/context-budget`.
Skip by default. If added:

```bash
git add CLAUDE.md
git commit -m "docs: point at context-budget skill from CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**
- Threshold model (200k budget, 30/60 tiers) → Task 1 `resolveTier` + `buildReminder`, documented in Task 3 skill. ✓
- Hook on `UserPromptSubmit`, reads transcript usage, sums input+cache → Task 1 `occupancyFromLines` + `main`. ✓
- Debounce (escalation + Hard re-emit, per-session, self-reset) → Task 1 `shouldEmit` + state file; tested. ✓
- Fail-safe (always exit 0, silent on error) → Task 1 `main` try/catch + tests. ✓
- `additionalContext` JSON shape → Task 1 `main`; integration test asserts shape. ✓
- Registration + gitignore → Task 2. ✓
- Skill policy + hint-craft + when-not-to-compact → Task 3. ✓
- State file ignored → Task 2 Step 3. ✓
- Tests kept out of vitest → Task 4 Step 2. ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows complete content. ✓

**Type/name consistency:** `TIER`, `resolveTier`, `occupancyFromLines`, `shouldEmit`, `buildReminder`, `EFFECTIVE_BUDGET` are used identically across the test file (Task 1 Step 1) and the implementation (Task 1 Step 3). Hook command path in `settings.json` (Task 2) matches the script path created in Task 1. ✓
