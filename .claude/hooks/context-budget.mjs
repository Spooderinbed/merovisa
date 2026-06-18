#!/usr/bin/env node
// context-budget hook — nudges toward a focused /compact before context rot.
// Registered as a Claude Code UserPromptSubmit hook. Policy: .claude/skills/context-budget/SKILL.md
import { readFileSync, writeFileSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
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
      return usage.input_tokens
        + (usage.cache_read_input_tokens || 0)
        + (usage.cache_creation_input_tokens || 0);
    }
  }
  return null;
}

export function buildReminder(tier, tokens, budget = EFFECTIVE_BUDGET) {
  if (tier === TIER.SAFE) return '';
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

// Read up to the last `maxBytes` of a file as lines, so we don't load huge
// transcripts in full on every prompt. `partial` is true when the file was
// larger than the window (the first line may then be truncated).
function readLinesTail(filePath, maxBytes = 262144) {
  const fd = openSync(filePath, 'r');
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    if (buf.length) readSync(fd, buf, 0, buf.length, start);
    return { lines: buf.toString('utf8').split('\n'), partial: start > 0 };
  } finally {
    closeSync(fd);
  }
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

  let tokens;
  try {
    const tail = readLinesTail(transcriptPath);
    tokens = occupancyFromLines(tail.lines);
    // If the latest usage sat beyond the tail window (e.g. a very large final
    // turn), fall back to a full read so detection stays correct.
    if (tokens == null && tail.partial) {
      tokens = occupancyFromLines(readFileSync(transcriptPath, 'utf8').split('\n'));
    }
  } catch { return; }
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
