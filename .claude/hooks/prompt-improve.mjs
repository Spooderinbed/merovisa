#!/usr/bin/env node
// Prompt Improver Hook (lean, improve-only) — UserPromptSubmit.
//
// Faithful port of the flagship "improve" nudge from
// severity1/claude-code-prompt-improver (MIT), reimplemented standalone in Node
// so it needs no Python engine, no plugin, and no separate skill file.
//
// On every non-bypass prompt it injects a clarity-evaluation wrapper as
// additionalContext. The hook does NOT call a model — it just hands Claude a
// standing instruction to (a) proceed immediately when the prompt is clear, or
// (b) run a short clarify pass when it is genuinely vague.
//
// Bypass prefixes mirror upstream: `*` (explicit skip), `/` (slash command),
// `#` (memorize), and an empty prompt all suppress the wrapper.
//
// Safety: this hook must NEVER block a prompt. Any error, or a 2s stdin
// timeout, exits 0 with no output.

function wrapper(prompt) {
  return `PROMPT EVALUATION (Prompt Improver Hook)

Original user request: "${prompt}"

EVALUATE: is this prompt clear enough to execute, or does it need enrichment?

PROCEED IMMEDIATELY if the request is detailed/specific, OR you already have sufficient context, OR you can reasonably infer intent. Trust user intent by default, and check conversation history before deciding it is vague. When the prompt is clear, do NOT mention this hook.

ONLY IF GENUINELY VAGUE (e.g. "fix the bug" with no target or scope):
1. Preface your reply with one line: "Hey! The Prompt Improver Hook flagged your prompt as a bit vague because [specific reason: ambiguous scope / missing context / unclear target / etc]."
2. Cheaply gather any context that is one tool-call away (read the obvious file, grep the symbol) before asking — never ask what you can verify yourself.
3. Ask the 1-6 highest-value clarifying questions. When the unknowns are genuine forks with discrete options, ask via the AskUserQuestion tool; otherwise ask inline. Then proceed with the clarification.`;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve(data);
      }
    };
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      data += c;
    });
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    setTimeout(finish, 2000).unref?.(); // never hang the prompt
  });
}

try {
  const raw = await readStdin();
  let prompt = "";
  try {
    const parsed = JSON.parse(raw || "{}");
    if (typeof parsed.prompt === "string") prompt = parsed.prompt;
  } catch {
    prompt = "";
  }

  const t = prompt.trimStart();
  // Bypass: empty, explicit (*), slash command (/), or memorize (#).
  if (!t || t.startsWith("*") || t.startsWith("/") || t.startsWith("#")) {
    process.exit(0);
  }

  const out = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: wrapper(prompt),
    },
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
} catch {
  process.exit(0); // never block the user's prompt on hook failure
}
