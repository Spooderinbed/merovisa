// Generates board.md (human-readable) and board.html (standalone visual dashboard)
// from board.json. Run: `npm run board`. board.json is the source of truth for board
// STATE; cards/*.md are the source of truth for card DETAIL. Do not hand-edit the
// generated files — edit board.json + the dossiers, then regenerate.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateBoard } from "./validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const board = JSON.parse(readFileSync(join(here, "board.json"), "utf8"));

// MV-123: refuse to generate from a board that lies. Silently rendering a duplicate
// id, a dead dossier link, or a forgotten card is how the board lost MV-100 and
// stranded MV-99/MV-101 in the wrong column for ten days. Fail loudly instead.
const problems = validateBoard(board, {
  exists: (f) => existsSync(join(here, f)),
  dossiers: readdirSync(join(here, "cards"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `cards/${f}`),
  readHeading: (f) => readFileSync(join(here, f), "utf8").match(/^#\s.*/m)?.[0] ?? null,
  hasColumnField: (f) => /^\*\*Column:\*\*/m.test(readFileSync(join(here, f), "utf8")),
});
if (problems.length) {
  console.error(`\n✗ board.json failed ${problems.length} integrity check(s). Nothing was regenerated.\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error(`\nFix board.json (or the dossiers), then re-run \`npm run board\`.\n`);
  process.exit(1);
}

const DAY = 86_400_000;
const now = Date.now();
const days = (iso) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : null);

// Derive age / time-in-column / cycle-time / staleness for each card.
const colByKey = Object.fromEntries(board.columns.map((c) => [c.key, c]));
const cards = board.cards.map((c) => {
  const ageDays = days(c.created);
  const inColDays = days(c.entered);
  const cycleDays = c.done && c.created ? Math.max(0, Math.floor((Date.parse(c.done) - Date.parse(c.created)) / DAY)) : null;
  const active = colByKey[c.col]?.active ?? false;
  const stale = active && inColDays != null && inColDays >= board.staleDays;
  return { ...c, ageDays, inColDays, cycleDays, stale };
});

const priLabel = { P1: "P1", P2: "P2", P3: "P3" };

// ---------- board.md ----------
function badgeMd(c) {
  if (c.badge === "next") return " `next up`";
  if (c.badge === "GO") return " `awaiting GO`";
  if (c.badge && c.badge.startsWith("blocked")) return " `" + c.badge + "`";
  return "";
}
let md = `# MyVisa — Kanban board

> **Generated from [board.json](board.json) by \`npm run board\` — do not hand-edit.**
> Edit board.json (state) + [cards/](cards/) (detail), then regenerate. The visual
> dashboard is [board.html](board.html) (open in a browser). See [README.md](README.md)
> for how the board works.
>
> _Last updated: ${board.updated} · stale threshold: ${board.staleDays}d_

`;
for (const col of board.columns) {
  const list = cards.filter((c) => c.col === col.key);
  const cap = col.wip ? ` (WIP ${col.wip})` : "";
  md += `\n## ${col.name}${cap} — ${list.length}\n\n`;
  if (!list.length) {
    md += `_empty_\n`;
    continue;
  }
  for (const c of list) {
    const pri = c.pri ? `${priLabel[c.pri]} · ` : "";
    const title = c.file ? `[${c.title}](${c.file})` : c.title;
    const stale = c.stale ? ` · ⏳ ${c.inColDays}d in column` : "";
    md += `- **${c.id}** · ${pri}${title}${badgeMd(c)}${stale} — _${c.summary}_\n`;
  }
}
writeFileSync(join(here, "board.md"), md);

// ---------- board.html (standalone) ----------
// Browser render function — NO template literals / backticks inside (it is serialized
// via .toString() into the HTML, so backticks would break the wrapper string).
function clientMain() {
  var B = window.__BOARD__;
  var pri = { P1: "var(--danger)", P2: "var(--warn)", P3: "var(--muted)" };

  function metric(v, l) {
    return '<div class="m"><div class="mv">' + v + '</div><div class="ml">' + l + "</div></div>";
  }
  var ready = B.cards.filter(function (c) { return c.col === "ready"; }).length;
  var prog = B.cards.filter(function (c) { return c.col === "inprogress"; }).length;
  var review = B.cards.filter(function (c) { return c.col === "inreview"; }).length;
  var done = B.cards.filter(function (c) { return c.col === "done"; }).length;
  var stale = B.cards.filter(function (c) { return c.stale; }).length;
  document.getElementById("metrics").innerHTML =
    metric(ready, "Ready to start") + metric(prog, "In progress") +
    metric(review, "Awaiting GO") + metric(stale, "Stale (>" + B.config.staleDays + "d)");

  function badge(c) {
    var out = "";
    if (c.badge === "next") out += '<span class="b bi">next up</span>';
    if (c.badge === "GO") out += '<span class="b bw">awaiting GO</span>';
    if (c.badge && c.badge.indexOf("blocked") === 0) out += '<span class="b bd">' + c.badge + "</span>";
    if (c.stale) out += '<span class="b bd">stale ' + c.inColDays + "d</span>";
    return out;
  }
  function ageLine(c) {
    if (c.col === "done") return c.cycleDays != null ? "cycle " + c.cycleDays + "d" : "done";
    var t = "age " + c.ageDays + "d";
    if (c.inColDays != null) t += " · " + c.inColDays + "d in column";
    return t;
  }
  function actLabel(col) {
    if (col === "ready") return "Copy: start this";
    if (col === "inreview") return "Copy: approve";
    return "Copy: ask about this";
  }
  function actText(c) {
    if (c.col === "ready") return "Start " + c.id + ": move it to In Progress on the board and begin the work.";
    if (c.col === "inreview") return "Go ahead with " + c.id + ".";
    return "Tell me more about " + c.id + ".";
  }

  var boardEl = document.getElementById("board");
  function render() {
    var f = document.querySelector(".pill.on").getAttribute("data-f");
    var q = document.getElementById("q").value.trim().toLowerCase();
    var onlyStale = document.getElementById("stale").checked;
    boardEl.innerHTML = "";
    B.columns.forEach(function (col) {
      var list = B.cards.filter(function (c) {
        if (c.col !== col.key) return false;
        if (f !== "all" && c.pri !== f) return false;
        if (onlyStale && !c.stale) return false;
        if (q && (c.id + " " + c.title + " " + c.summary).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var total = B.cards.filter(function (c) { return c.col === col.key; }).length;
      var wip = "";
      if (col.wip) {
        var full = total >= col.wip;
        wip = '<span class="wip' + (full ? " full" : "") + '">' + total + "/" + col.wip + "</span>";
      } else {
        wip = '<span class="wip">' + total + "</span>";
      }
      var h = '<div class="col"><div class="ch"><span>' + col.name + "</span>" + wip + "</div>";
      if (!list.length) h += '<div class="empty">— none</div>';
      list.forEach(function (c) {
        var dot = c.pri ? '<span class="dot" style="background:' + pri[c.pri] + '"></span>' : "";
        var b = badge(c);
        h += '<div class="card' + (c.badge === "next" ? " next" : "") + '" data-id="' + c.id + '">' +
          '<div class="t"><span class="cid">' + c.id + "</span>" + dot + "</div>" +
          '<div class="ti">' + c.title + "</div>" +
          (b ? '<div class="bs">' + b + "</div>" : "") +
          '<div class="age">' + ageLine(c) + "</div>" +
          '<div class="det"><p>' + c.summary + "</p>" +
          (c.file ? '<a href="' + c.file + '">open dossier →</a>' : "") +
          '<button class="act" data-act="' + c.id + '">' + actLabel(c.col) + "</button></div>" +
          "</div>";
      });
      h += "</div>";
      boardEl.insertAdjacentHTML("beforeend", h);
    });
  }
  render();

  boardEl.addEventListener("click", function (e) {
    var act = e.target.closest(".act");
    if (act) {
      e.stopPropagation();
      var c = B.cards.find(function (x) { return x.id === act.getAttribute("data-act"); });
      if (c && navigator.clipboard) {
        navigator.clipboard.writeText(actText(c));
        var o = act.textContent; act.textContent = "copied — paste to Claude"; setTimeout(function () { act.textContent = o; }, 1600);
      }
      return;
    }
    if (e.target.closest("a")) return;
    var card = e.target.closest(".card");
    if (!card) return;
    var d = card.querySelector(".det");
    d.style.display = d.style.display === "block" ? "none" : "block";
  });
  document.querySelectorAll(".pill").forEach(function (p) {
    p.addEventListener("click", function () {
      document.querySelectorAll(".pill").forEach(function (x) { x.classList.remove("on"); });
      p.classList.add("on"); render();
    });
  });
  document.getElementById("q").addEventListener("input", render);
  document.getElementById("stale").addEventListener("change", render);
}

const payload = {
  columns: board.columns,
  cards,
  config: { staleDays: board.staleDays, updated: board.updated },
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MyVisa — board</title>
<style>
:root{--paper:#f6f5f1;--surface:#fff;--ink:#1a1c1a;--muted:#6b6f6a;--line:rgba(0,0,0,.12);--teal:#0f5e54;--danger:#b1503a;--warn:#b07d22;--info:#0f5e54;--ok:#1f6d4a}
@media(prefers-color-scheme:dark){:root{--paper:#111210;--surface:#191b18;--ink:#e9eae6;--muted:#9aa09a;--line:rgba(255,255,255,.14);--teal:#4eb39f;--danger:#d6816d;--warn:#d6a94f;--info:#4eb39f;--ok:#5fae84}}
*{box-sizing:border-box}
body{margin:0;background-color:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.5}
.wrap{max-width:1100px;margin:0 auto;padding:24px 20px 48px}
h1{font-size:20px;font-weight:600;margin:0 0 2px}
.sub{font-size:12px;color:var(--muted);margin:0 0 18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.m{background:var(--surface);border:.5px solid var(--line);border-radius:12px;padding:12px 14px}
.mv{font-size:24px;font-weight:600}.ml{font-size:12px;color:var(--muted)}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.pill{font-size:12px;border:.5px solid var(--line);background:transparent;color:var(--ink);border-radius:999px;padding:4px 13px;cursor:pointer}
.pill.on{background:var(--teal);color:#fff;border-color:var(--teal)}
#q{flex:1;min-width:160px;height:32px;border:.5px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);padding:0 10px;font-size:13px}
.chk{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:5px;cursor:pointer}
.board{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;align-items:start}
.col{display:flex;flex-direction:column;gap:8px}
.ch{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600;padding:0 2px}
.wip{font-size:11px;color:var(--muted);font-family:ui-monospace,monospace}.wip.full{color:var(--warn)}
.empty{font-size:12px;color:var(--muted);font-style:italic;padding:4px 2px}
.card{background:var(--surface);border:.5px solid var(--line);border-radius:8px;padding:9px 11px;cursor:pointer}
.card.next{border:2px solid var(--teal)}
.t{display:flex;align-items:center;justify-content:space-between}
.cid{font-family:ui-monospace,monospace;font-size:11px;color:var(--muted)}
.dot{width:8px;height:8px;border-radius:50%}
.ti{font-size:13px;margin-top:3px}
.bs{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
.b{font-size:10.5px;padding:1px 8px;border-radius:999px;font-family:ui-monospace,monospace}
.bi{background:rgba(15,94,84,.13);color:var(--teal)}.bw{background:rgba(176,125,34,.16);color:var(--warn)}.bd{background:rgba(177,80,58,.14);color:var(--danger)}
.age{font-size:11px;color:var(--muted);margin-top:6px;font-family:ui-monospace,monospace}
.det{display:none;margin-top:8px;padding-top:8px;border-top:.5px solid var(--line);font-size:12.5px;color:var(--muted)}
.det p{margin:0 0 8px}.det a{color:var(--teal);font-size:12px;text-decoration:none}
.act{display:block;margin-top:8px;font-size:11.5px;border:.5px solid var(--line);background:transparent;color:var(--ink);border-radius:8px;padding:4px 10px;cursor:pointer}
</style>
</head>
<body>
<div class="wrap">
  <h1>MyVisa — board</h1>
  <p class="sub">generated from board.json · ${board.updated} · stale &gt; ${board.staleDays}d · regenerate with npm run board</p>
  <div class="metrics" id="metrics"></div>
  <div class="bar">
    <button class="pill on" data-f="all">All</button>
    <button class="pill" data-f="P1">P1</button>
    <button class="pill" data-f="P2">P2</button>
    <button class="pill" data-f="P3">P3</button>
    <input id="q" placeholder="search cards…" />
    <label class="chk"><input type="checkbox" id="stale" /> stale only</label>
  </div>
  <div class="board" id="board"></div>
</div>
<script>window.__BOARD__=${JSON.stringify(payload)};(${clientMain.toString()})();<\/script>
</body>
</html>
`;
writeFileSync(join(here, "board.html"), html);

console.log(`board.md + board.html generated · ${cards.length} cards · ${cards.filter((c) => c.stale).length} stale`);
