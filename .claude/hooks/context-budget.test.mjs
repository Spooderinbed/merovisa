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
test('occupancyFromLines: reads top-level usage (no message wrapper)', () => {
  const line = JSON.stringify({ usage: { input_tokens: 70_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
  assert.equal(occupancyFromLines([line]), 70_000);
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

test('integration: a new session re-emits after SOFT (debounce resets)', () => {
  const dir = tempProject();
  const transcript = path.join(dir, 't.jsonl');
  writeFileSync(transcript, usageLine(80_000) + '\n');
  const first = runHook({ transcript_path: transcript, session_id: 'sA', cwd: dir }, dir);
  assert.notEqual(first.stdout.trim(), '');
  const newSession = runHook({ transcript_path: transcript, session_id: 'sB', cwd: dir }, dir);
  assert.notEqual(newSession.stdout.trim(), ''); // different session => reset => emits
  rmSync(dir, { recursive: true, force: true });
});

test('integration: invalid stdin => exit 0, no output', () => {
  const res = spawnSync(process.execPath, [SCRIPT], { input: 'not json at all', encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

test('integration: large transcript still detects latest usage (tail + fallback)', () => {
  const dir = tempProject();
  const transcript = path.join(dir, 't.jsonl');
  // Earlier usage line, then a very large trailing non-JSON line (> tail window)
  // so detection must fall back to a full read.
  writeFileSync(transcript, usageLine(130_000) + '\n' + 'x'.repeat(300_000) + '\n');
  const res = runHook({ transcript_path: transcript, session_id: 'big', cwd: dir }, dir);
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /\/compact/);
  rmSync(dir, { recursive: true, force: true });
});
