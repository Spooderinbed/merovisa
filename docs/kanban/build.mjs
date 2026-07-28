// Generates board.md (human-readable) and board.html (standalone visual dashboard)
// from board.json. Run: `npm run board`. board.json is the source of truth for board
// STATE; cards/*.md are the source of truth for card DETAIL. Do not hand-edit the
// generated files — edit board.json + the dossiers, then regenerate.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateBoard } from "./validate.mjs";
import { parsePrList, matchPrsToCards, reconcile } from "./pr-enrich.mjs";

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

// ---------- live PR enrichment (MV-148) ----------
// One `gh` call per generation, joined onto cards by the MV-id in the branch/title.
// This is DERIVED, like ageDays: it is never written back to board.json, so a GitHub
// outage can only cost the chips, never the board. Everything below fails soft.
const GH_FIELDS = "number,title,url,headRefName,isDraft,state,reviewDecision,statusCheckRollup,files,additions,deletions";

function fetchPullRequests() {
  try {
    const raw = execFileSync("gh", ["pr", "list", "--state", "all", "--limit", "50", "--json", GH_FIELDS], {
      cwd: here,
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return parsePrList(raw);
  } catch (err) {
    return { prs: [], error: ghReason(err) };
  }
}

/** Say WHY the chips are missing — "unavailable" alone reads like a bug in the board. */
function ghReason(err) {
  if (err?.code === "ENOENT") return "gh CLI not found on PATH";
  if (err?.signal || err?.code === "ETIMEDOUT") return "gh timed out after 20s";
  const stderr = String(err?.stderr ?? "").trim().split("\n")[0];
  if (/auth|login|credential|token/i.test(stderr)) return `gh is not authenticated (${stderr})`;
  return stderr || String(err?.message ?? "gh failed");
}

const fetchedAt = `${new Date(now).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const { prs: livePrs, error: prError } = fetchPullRequests();
const prsByCard = matchPrsToCards(cards, livePrs);
for (const c of cards) c.prs = prsByCard.get(c.id) ?? [];

// Reconciliation only runs on data we actually have. Warning "no open PR" for every
// In Review card because gh was offline would be the board lying about the repo.
const prWarnings = prError ? [] : reconcile(cards, prsByCard);
const matchedNumbers = new Set([...prsByCard.values()].flat().map((p) => p.number));
const unownedOpen = prError ? [] : livePrs.filter((p) => p.state === "OPEN" && !matchedNumbers.has(p.number));
const inFlight = cards.flatMap((c) => c.prs.filter((p) => p.state === "open").map((p) => ({ ...p, card: c.id, cardTitle: c.title })));

// ---------- board.md ----------
function badgeMd(c) {
  if (c.badge === "next") return " `next up`";
  if (c.badge === "GO") return " `awaiting GO`";
  if (c.badge && c.badge.startsWith("blocked")) return " `" + c.badge + "`";
  return "";
}
const ciMd = (p) => (p.ci.state === "none" ? "no checks" : `${p.ci.state} ${p.ci.passed}/${p.ci.total}`);
const reviewMd = (p) => (p.review ? p.review.replace(/_/g, " ") : "—");
const areasMd = (p) => (p.areas.length ? p.areas.slice(0, 4).map((a) => a.dir).join(" · ") : "—");
function prMd(c) {
  if (!c.prs.length) return "";
  const one = (p) => `[#${p.number}](${p.url}) ${p.draft ? "draft" : p.state}${p.ci.state === "none" ? "" : `, ci ${p.ci.state}`}`;
  return ` · ${c.prs.map(one).join(" · ")}`;
}

// The in-flight strip: what every parallel session currently has open, at a glance.
function inFlightMd() {
  if (prError) {
    return `> ⚠️ **PR data unavailable** — ${prError}. The board below is complete; only the live PR/CI chips are missing.\n\n`;
  }
  let out = `### In flight — ${inFlight.length} open PR${inFlight.length === 1 ? "" : "s"}\n\n`;
  // Stamp the snapshot: board.md is committed, so without a time a week-old PR table
  // reads exactly like a live one.
  out += `> Read from \`gh\` at ${fetchedAt}. **Not board state** — never written to board.json.\n\n`;
  if (!inFlight.length) {
    out += `_No open PRs._\n\n`;
  } else {
    out += `| Card | PR | | CI | Review | Touches |\n|---|---|---|---|---|---|\n`;
    for (const p of inFlight) {
      out += `| **${p.card}** | [#${p.number}](${p.url}) | ${p.draft ? "draft" : "open"} | ${ciMd(p)} | ${reviewMd(p)} | ${areasMd(p)} |\n`;
    }
    out += `\n`;
  }
  if (unownedOpen.length) {
    const [s, verb] = unownedOpen.length === 1 ? ["", "matches"] : ["s", "match"];
    out += `_${unownedOpen.length} open PR${s} ${verb} no card: ${unownedOpen.map((p) => `[#${p.number}](${p.url})`).join(", ")}._\n\n`;
  }
  for (const w of prWarnings) out += `> ⚠️ ${w}\n`;
  if (prWarnings.length) out += `\n`;
  return out;
}
let md = `# MyVisa — Kanban board

> **Generated from [board.json](board.json) by \`npm run board\` — do not hand-edit.**
> Edit board.json (state) + [cards/](cards/) (detail), then regenerate. The visual
> dashboard is [board.html](board.html) (open in a browser). See [README.md](README.md)
> for how the board works.
>
> _Last updated: ${board.updated} · stale threshold: ${board.staleDays}d_

${inFlightMd()}`;
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
    md += `- **${c.id}** · ${pri}${title}${badgeMd(c)}${stale} — _${c.summary}_${prMd(c)}\n`;
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
  var stale = B.cards.filter(function (c) { return c.stale; }).length;
  document.getElementById("metrics").innerHTML =
    metric(ready, "Ready to start") + metric(prog, "In progress") +
    metric(review, "Awaiting GO") + metric(stale, "Stale (>" + B.config.staleDays + "d)");

  // In-flight strip: what every parallel session has open right now. Ephemeral —
  // derived from gh at generation time, never part of board state.
  var P = B.pr;
  var strip = "";
  if (!P.available) {
    strip = '<div class="ps warn"><b>PR data unavailable</b> — ' + esc(P.error) +
      ". The board is complete; only the live PR chips are missing.</div>";
  } else {
    var rows = "";
    P.inFlight.forEach(function (p) {
      var areas = (p.areas || []).slice(0, 4).map(function (a) { return esc(a.dir); }).join(" · ") || "—";
      rows += '<div class="psr"><a href="' + esc(p.url) + '" target="_blank" rel="noopener">#' + p.number + "</a>" +
        '<span class="cid">' + esc(p.card) + "</span>" +
        '<span class="b ' + ciCls(p.ci.state) + '">' + (p.draft ? "draft · " : "") + "ci " + p.ci.state + "</span>" +
        (p.review ? '<span class="b ' + revCls(p.review) + '">' + esc(words(p.review)) + "</span>" : "") +
        '<span class="psa">' + areas + "</span></div>";
    });
    strip = '<div class="ps"><div class="psh">In flight — ' + P.inFlight.length + " open PR" +
      (P.inFlight.length === 1 ? "" : "s") + '<span class="pss">read from gh ' + esc(P.fetchedAt) + " · not board state</span></div>" +
      (rows || '<div class="psq">No open PRs.</div>');
    if (P.unowned.length) {
      strip += '<div class="psq">' + P.unowned.length + (P.unowned.length === 1 ? " open PR matches" : " open PRs match") +
        " no card: " + P.unowned.map(function (n) {
          return '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">#' + n.number + "</a>";
        }).join(", ") + "</div>";
    }
    P.warnings.forEach(function (w) { strip += '<div class="psw">⚠ ' + esc(w) + "</div>"; });
    strip += "</div>";
  }
  document.getElementById("prstrip").innerHTML = strip;

  // PR titles and branch names come from GitHub, not from the repo — escape them.
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function ciCls(s) {
    if (s === "passing") return "bo";
    if (s === "failing") return "bd";
    if (s === "pending") return "bw";
    return "bm";
  }
  function revCls(r) {
    if (r === "approved") return "bo";
    if (r === "changes_requested") return "bd";
    return "bm";
  }
  function words(s) { return String(s).replace(/_/g, " "); }
  // Collapsed card: the PR chip carries its own CI colour, so green needs no second
  // chip. Only a review decision the founder must act on earns extra ink.
  function prChips(c) {
    var out = "";
    (c.prs || []).forEach(function (p) {
      out += '<a class="b pr ' + ciCls(p.ci.state) + '" href="' + esc(p.url) + '" target="_blank" rel="noopener">#' +
        p.number + " " + (p.draft ? "draft" : esc(p.state)) + "</a>";
      if (p.ci.state === "failing" || p.ci.state === "pending") {
        out += '<span class="b ' + ciCls(p.ci.state) + '">ci ' + p.ci.state + " " + p.ci.passed + "/" + p.ci.total + "</span>";
      }
      if (p.review) out += '<span class="b ' + revCls(p.review) + '">' + esc(words(p.review)) + "</span>";
    });
    return out;
  }
  function prDetail(c) {
    var out = "";
    (c.prs || []).forEach(function (p) {
      var areas = (p.areas || []).slice(0, 4).map(function (a) { return esc(a.dir); }).join(" · ") || "—";
      out += '<div class="prd"><a href="' + esc(p.url) + '" target="_blank" rel="noopener">#' + p.number + "</a> " +
        esc(p.branch) + " · +" + p.additions + " −" + p.deletions + " · " + p.changedFiles + " files · " + areas + "</div>";
    });
    return out;
  }

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
        var b = badge(c) + prChips(c);
        h += '<div class="card' + (c.badge === "next" ? " next" : "") + '" data-id="' + c.id + '">' +
          '<div class="t"><span class="cid">' + c.id + "</span>" + dot + "</div>" +
          '<div class="ti">' + c.title + "</div>" +
          (b ? '<div class="bs">' + b + "</div>" : "") +
          '<div class="age">' + ageLine(c) + "</div>" +
          '<div class="det"><p>' + c.summary + "</p>" + prDetail(c) +
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
  pr: {
    available: !prError,
    error: prError,
    fetchedAt,
    inFlight,
    unowned: unownedOpen.map((p) => ({ number: p.number, url: p.url })),
    warnings: prWarnings,
  },
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
.bo{background:rgba(31,109,74,.15);color:var(--ok)}.bm{background:rgba(128,128,128,.16);color:var(--muted)}
a.b{text-decoration:none}a.pr{font-weight:600}
.ps{background:var(--surface);border:.5px solid var(--line);border-radius:12px;padding:10px 13px;margin-bottom:16px}
.ps.warn{border-color:var(--warn);color:var(--warn);font-size:12.5px}
.psh{display:flex;align-items:baseline;gap:8px;font-size:13px;font-weight:600;margin-bottom:6px}
.pss{font-size:11px;font-weight:400;color:var(--muted);font-family:ui-monospace,monospace}
.psr{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:12px;padding:3px 0}
.psr a{color:var(--teal);font-family:ui-monospace,monospace;text-decoration:none}
.psa{color:var(--muted);font-size:11.5px;font-family:ui-monospace,monospace}
.psq{font-size:11.5px;color:var(--muted);padding:3px 0}.psq a{color:var(--teal);text-decoration:none}
.psw{font-size:11.5px;color:var(--warn);padding:3px 0}
.prd{font-family:ui-monospace,monospace;font-size:11px;margin:0 0 8px}.prd a{font-size:11px}
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
  <div id="prstrip"></div>
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
<script>window.__BOARD__=${JSON.stringify(payload).replace(/</g, "\\u003c")};(${clientMain.toString()})();<\/script>
</body>
</html>
`;
writeFileSync(join(here, "board.html"), html);

console.log(`board.md + board.html generated · ${cards.length} cards · ${cards.filter((c) => c.stale).length} stale`);
// PR enrichment reports; it never fails the build. Reconciliation is a nudge to fix
// board.json, not a claim that board.json is corrupt — that is validate.mjs's job.
if (prError) {
  console.warn(`  ⚠ PR data unavailable (${prError}) — generated without live PR chips.`);
} else {
  console.log(`  · ${livePrs.length} PRs read from gh · ${matchedNumbers.size} joined to cards · ${inFlight.length} in flight`);
}
for (const w of prWarnings) console.warn(`  ⚠ ${w}`);
