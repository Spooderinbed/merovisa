# Claude Code memory snapshot

This folder is a **committed copy** of the Claude Code project memory that otherwise
lives only on the local machine (outside the repo) at:

```
<home>/.claude/projects/C--Users-thapa-OneDrive-Desktop-work-merovisa/memory/
```

It is checked in so the project's accumulated context survives a machine change,
an Anthropic-account switch, or a fresh `git clone` — none of which carry the
local `~/.claude/` files automatically.

## Files
- `project_vision.md` — the MyVisa product vision (the durable "why").
- `MEMORY.md` — the memory index that links to the above.

## Restore onto a new machine / account
Claude Code reads memory from `~/.claude/`, not from the repo, so to make a new
environment "remember" this project, copy these files back:

1. Start Claude Code once inside the cloned repo so it creates the project folder
   `~/.claude/projects/<hash>/` (the `<hash>` is derived from the repo's absolute path).
2. Copy `MEMORY.md` and `project_vision.md` from here into that folder's `memory/`
   subdirectory (create it if missing).

## Full conversation history (not in git)
The complete session transcripts are large local files and are **not** committed:

```
~/.claude/projects/C--Users-thapa-OneDrive-Desktop-work-merovisa/*.jsonl
```

Back them up separately (e.g. zip the whole project folder) if you want to
`claude --resume` these exact conversations on another machine.
