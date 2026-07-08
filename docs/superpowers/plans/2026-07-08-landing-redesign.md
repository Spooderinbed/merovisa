# Landing Page Redesign (MV-112) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the signed-out landing page (`app/(marketing)/page.tsx` + `components/marketing/*`) into the v7 "Cursor cadence" journey — a hero verdict panel, then alternating product sections each anchored by one real interactive artifact — in the calm-authority skin, with server-rendered filled rest states and JS-only enhancement.

**Architecture:** A server-component page shell composes static copy + a handful of small client islands. Every island's first client paint is byte-identical to its server HTML (no `matchMedia` / `IntersectionObserver` / `requestAnimationFrame` / `Math.random` during render — all deferred to `useEffect`). Sample-vs-sourced data lives in five typed modules behind a `kind: 'sample' | 'sourced'` discriminated union so the honesty invariant is type-enforced and testable in isolation. Accordions use native `<details>/<summary>`, checklist uses native `<input type="checkbox">`, and the profile/guide toggles use native radios — so rest state, no-JS operation, and a11y come for free. Styling is a scoped, self-contained CSS file (`app/(marketing)/landing.css`) that ports the reference `:root` token block (both themes, three ways) plus the keyframes, paper grain, hero marker, sparkle CTA, and accordion `grid-template-rows` — none of which map cleanly to utilities.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind CSS v4 (CSS `@theme` in `app/globals.css` — there is **no** `tailwind.config.js`; additive tokens live in scoped CSS custom properties), Supabase SSR auth (`getUser()` guard), Vitest + React Testing Library (jsdom), `react-dom/server` `renderToStaticMarkup` for no-effects rest-state assertions.

---

## Reconciliation decisions (read before starting)

These resolve ambiguities between the spec, the reference, and the existing codebase. They are load-bearing; every task assumes them.

1. **Header + footer come from the existing layout, not the page.** `app/(marketing)/layout.tsx` already wraps every marketing route (including `/how`, `/destinations`, `/trust`, `/auth`) with `<AppBar variant="marketing">` (Sign in → `/auth`, brand → `/`) and `<Footer>`. The reference's `<header>`/`<footer>` are the mock's stand-ins for that shared chrome. The rebuilt page renders **only the body** (hero → plan → documents → guide → freshness → close) and does **not** emit its own header/footer (doing so would double the chrome or force a high-blast-radius change to sibling routes). The page adds `id="how"` and `id="what"` on the plan + documents sections so the in-page anchors resolve.

   **✅ RESOLVED — founder chose (b), keep shared chrome (2026-07-08).** The shipped `AppBar` (`components/layout/app-bar.tsx`) marketing nav (`NAV_MARKETING = [How it works → /how, Destinations → /destinations, Why trust us → /trust]`, hidden at `md:`/768px) is **retained as-is** for this slice — do **not** rewrite it, do **not** touch the 768px breakpoint, do **not** add a route-group split. The rebuilt page still adds `id="how"`/`id="what"` on the plan + documents sections purely for deep-link (`/#how`, `/#what`) support; they are intentionally not the AppBar nav's targets. Invariant 5's Sign in → `/auth` and CTA → `/assess` are already satisfied by the AppBar. This closes the only open decision; Task 18 is unblocked and needs no AppBar/nav sub-task.

2. **Tokens live in a scoped CSS file, not a JS Tailwind config.** This repo is Tailwind v4 (`@theme` in `app/globals.css`); there is no `tailwind.config.*`. Per spec §5 ("port the reference `:root` block verbatim") the reference tokens (`--paper`, `--frame`, `--ink`, `--plum`, `--mark`, verdicts, `--ease`, `--maxw`, `--sans`, `--mono`) are declared **verbatim, scoped under `.mv-landing`**, themed three ways, in `app/(marketing)/landing.css`. `--sans`/`--mono` map to the app's already-loaded `next/font` variables (`--font-hanken-grotesk` / `--font-ibm-plex-mono`), never a bare fallback stack.

3. **The reference's "build DOM from empty in JS" is inverted.** Server-render the filled state; JS only enhances. Fill widths and the estimated cost are set inline at their final values on the server (never 0, never a count-up at rest). "Animate fills from 0 on first view" and "count the cost up on first view" from the reference are intentionally dropped in favour of invariant 1 (final-width rest state); the count-up + width transition play only on a **profile swap** (Aarav⇄Shruti), which is hydration-safe.

4. **GTE is scrubbed from all user-facing copy.** The reference HTML still says "GTE" in the plan step 05, the checklist item, and the freshness row heading — do **not** copy those. Use "Genuine Student (GS)". The internal data **key** `'gte'` (an identifier) is fine; the question/answer/label **copy** must not contain "GTE" or "Genuine Temporary Entrant".

5. **Component decomposition vs. "server by default".** Native `<details>` need no React, so `plan-steps` and `hero-marker` are **server** components (CLAUDE.md: "client components only when interactivity is needed"). The other six (`verdict-panel`, `documents-checklist`, `guide-thread`, `freshness-table`, `sparkle-cta`, `reveal`) are client islands. Eight components total.

---

## File structure

**Created — data (`lib/marketing/`):**
- `lib/marketing/provenance.ts` — shared honesty types: `Tone`, `DimTag`, `VerdictWord`, `StepState`, `GuideKey`, the `Sample` / `Sourced` discriminated-union bases (`kind`).
- `lib/marketing/sample-profiles.ts` — the two `kind:'sample'` profiles (Aarav/Shruti), 4 dims each, cost, `formatCost()`. No citations.
- `lib/marketing/plan-steps.ts` — the 5 plan steps (`PLAN_STEPS`); step 02 `open:true`.
- `lib/marketing/checklist-items.ts` — the 6 checklist items (`CHECKLIST_ITEMS`); 2 `done:true`.
- `lib/marketing/guide-answers.ts` — the 3 exchanges (`GUIDE_ANSWERS`) keyed `ielts|funds|gte` + `GUIDE_ORDER`.
- `lib/marketing/freshness-rows.ts` — the 5 `kind:'sourced'` rows (`FRESHNESS_ROWS`) with source/verified/nextCheck.

**Created — styling:**
- `app/(marketing)/landing.css` — scoped `.mv-landing` token block (both themes ×3) + keyframes + grain + hero marker + sparkle CTA + accordion `grid-template-rows` + component classes ported from the reference.

**Created — components (`components/marketing/`):**
- `hero-marker.tsx` — **server**: the `.accent.hand` span.
- `reveal.tsx` — **client**: shared `.reveal` in-view wrapper (IO threshold 0.15, `rootMargin 0 0 -8% 0`); rest = visible.
- `verdict-panel.tsx` — **client**: native-radio profile toggle, controlled `.dim`/`.open` dimension rows (button + always-visible fill sibling + collapsible detail, per the reference — **not** native `<details>`, which would UA-hide the at-rest fill), final-width fills, cost count-up on swap. Rest = Aarav.
- `plan-steps.tsx` — **server**: native `<details name="mv-plan">` accordion; step 02 open.
- `documents-checklist.tsx` — **client**: native checkboxes, live count + progress fill. Rest = 2/6.
- `guide-thread.tsx` — **client**: native-radio chips + typewriter autoplay. Rest = `ielts` static.
- `freshness-table.tsx` — **client**: native-`<details>` rows, verified dots at rest, one-time verify sweep. Rest = all verified.
- `sparkle-cta.tsx` — **client**: real `<Link href="/assess">` styled as the sparkle button; particles seeded post-mount; `.live` in-view gate.

**Modified:**
- `app/(marketing)/page.tsx` — full rebuild to the v7 body; keeps `getUser()` → `redirect("/dashboard")`; drops `<TrustStrip/>`; imports `./landing.css`.
- `tests/setup.ts` — additive `matchMedia` + `IntersectionObserver` jsdom stubs.
- `tests/app/marketing-home.test.tsx` — rewritten for the v7 page (redirect + hero + no-dead-links + section ids).

**Deleted (after verifying no other importer):**
- `components/marketing/hero-preview.tsx` + `tests/components/marketing/hero-preview.test.tsx`
- `components/marketing/how-it-works.tsx` + `tests/components/marketing/how-it-works.test.tsx`
- `components/marketing/tile.tsx` + `tests/components/marketing/tile.test.tsx`
- `components/marketing/trust-callout.tsx` + `tests/components/marketing/trust-callout.test.tsx`
- `components/layout/trust-strip.tsx` — **only if** the landing was its sole importer.
- `components/marketing/eyebrow.tsx` — **keep** (used by sibling marketing pages; the new page uses the scoped `.eyebrow`/`.section-eyebrow` classes, not this component). Verify, do not delete unless orphaned.

**Created — tests:** one per data module + one per component (co-located under `tests/`), a copy-integrity guard, and a cross-cutting guard suite (see tasks).

---

## Task 1 (A): Scoped tokens + marketing CSS

**Files:**
- Create: `app/(marketing)/landing.css`
- Test: `tests/styles/landing-css.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/styles/landing-css.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readLandingCss(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // tests/styles
  return readFileSync(join(here, "..", "..", "app", "(marketing)", "landing.css"), "utf8");
}

describe("app/(marketing)/landing.css", () => {
  const css = readLandingCss();

  it("scopes every rule under .mv-landing (no bare global element/type selectors leak)", () => {
    // no unscoped `body`/`html`/`*` resets; the reference's bare button{}/svg{} must be scoped
    expect(css).not.toMatch(/^\s*body\s*\{/m);
    expect(css).not.toMatch(/^\s*\*\s*\{/m);
    expect(css).toMatch(/\.mv-landing\s+\.stage/);
    expect(css).toMatch(/\.mv-landing\s+\.sparkle-cta/);
  });

  it("declares the reference token block for light, dark-media, and both data-theme directions", () => {
    expect(css).toMatch(/\.mv-landing\s*\{[^}]*--paper:\s*#f4f1ea/);
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?\.mv-landing[\s\S]*?--paper:\s*#131013/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s+\.mv-landing[\s\S]*?--paper:\s*#131013/);
    expect(css).toMatch(/:root\[data-theme="light"\]\s+\.mv-landing[\s\S]*?--paper:\s*#f4f1ea/);
  });

  it("themes the hand-drawn marker token both ways (--mark light #a85b90 / dark #6a2b57)", () => {
    expect(css).toMatch(/--mark:\s*#a85b90/);
    expect(css).toMatch(/--mark:\s*#6a2b57/);
  });

  it("maps --sans/--mono to the app's loaded next/font variables (no bare fallback stack only)", () => {
    expect(css).toMatch(/--sans:\s*var\(--font-hanken-grotesk\)/);
    expect(css).toMatch(/--mono:\s*var\(--font-ibm-plex-mono\)/);
  });

  it("ports the three approved flourishes: hero marker filter, sparkle keyframes, paper grain", () => {
    expect(css).toMatch(/filter:\s*url\(#hero-rough\)/);
    expect(css).toMatch(/@keyframes\s+cta-flip/);
    expect(css).toMatch(/@keyframes\s+cta-rotate/);
    expect(css).toMatch(/feTurbulence/); // grain data-URI
    expect(css).toMatch(/mix-blend-mode:\s*multiply/);
  });

  it("uses grid-template-rows accordion transitions and a reveal + reduced-motion guard", () => {
    expect(css).toMatch(/grid-template-rows:\s*0fr/);
    expect(css).toMatch(/\.mv-reveal/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("caps width at the reference 1160px and clips horizontal overflow", () => {
    expect(css).toMatch(/--maxw:\s*1160px/);
    expect(css).toMatch(/overflow-x:\s*clip/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/styles/landing-css.test.ts`
Expected: FAIL — `ENOENT` (file `app/(marketing)/landing.css` does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `app/(marketing)/landing.css`. This is the reference `<style>` block, scoped under `.mv-landing`, with the four fidelity edits: (a) `--sans`/`--mono` map to app font vars, (b) the reference's `.js .reveal` becomes our `.mv-reveal.hidden`/`.mv-reveal.in`, (c) bare `button{}`/`svg{}` resets are scoped under `.mv-landing`, (d) `--mark` is the only genuinely new token.

```css
/* Landing v7 — scoped marketing CSS (MV-112).
   Ported verbatim from docs/superpowers/specs/assets/2026-07-08-landing-v7-reference.html,
   scoped under .mv-landing so nothing leaks into the rest of the app. Tokens are
   themed three ways (media query + both data-theme directions) for parity. */

.mv-landing {
  --paper:#f4f1ea; --frame:#efe8db;
  --ink:#241c22; --ink-soft:#6d626b; --ink-faint:#8b8188;
  --line:rgba(36,28,34,.13); --line-soft:rgba(36,28,34,.08);
  --plum:#6a2b57; --cta-ink:#fff; --mark:#a85b90;
  --strong:#1f6d4a; --possible:#8f6218; --reach:#a4472f;
  --ease:cubic-bezier(.22,.61,.36,1);
  --maxw:1160px;
  --sans:var(--font-hanken-grotesk),system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --mono:var(--font-ibm-plex-mono),ui-monospace,'SF Mono','Cascadia Code',monospace;
  color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;
  line-height:1.5;font-size:16px;overflow-x:clip;background-color:var(--paper);
}
@media (prefers-color-scheme:dark){
  .mv-landing{
    --paper:#131013; --frame:#1b161b;
    --ink:#ece4ea; --ink-soft:#9c9098; --ink-faint:#7d727a;
    --line:rgba(236,228,234,.15); --line-soft:rgba(236,228,234,.08);
    --plum:#c98bb4; --cta-ink:#1a1016; --mark:#6a2b57;
    --strong:#5fc196; --possible:#d8a44c; --reach:#dd8468;
  }
}
:root[data-theme="light"] .mv-landing{
  --paper:#f4f1ea; --frame:#efe8db; --ink:#241c22; --ink-soft:#6d626b; --ink-faint:#8b8188;
  --line:rgba(36,28,34,.13); --line-soft:rgba(36,28,34,.08);
  --plum:#6a2b57; --cta-ink:#fff; --mark:#a85b90; --strong:#1f6d4a; --possible:#8f6218; --reach:#a4472f;
}
:root[data-theme="dark"] .mv-landing{
  --paper:#131013; --frame:#1b161b; --ink:#ece4ea; --ink-soft:#9c9098; --ink-faint:#7d727a;
  --line:rgba(236,228,234,.15); --line-soft:rgba(236,228,234,.08);
  --plum:#c98bb4; --cta-ink:#1a1016; --mark:#6a2b57; --strong:#5fc196; --possible:#d8a44c; --reach:#dd8468;
}

.mv-landing *{box-sizing:border-box}
.mv-landing .wrap{max-width:var(--maxw);margin:0 auto;padding:0 26px}
.mv-landing a{color:inherit;text-decoration:none}
.mv-landing button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}
.mv-landing .mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.mv-landing a:focus-visible,.mv-landing button:focus-visible,.mv-landing input:focus-visible,.mv-landing summary:focus-visible{outline:2px solid var(--plum);outline-offset:3px;border-radius:8px}
.mv-landing .vh{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* hero */
.mv-landing .hero{padding:76px 0 26px}
.mv-landing .hero-top{max-width:760px}
.mv-landing .eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:22px}
.mv-landing h1{font-size:clamp(44px,5.6vw,74px);line-height:1.02;letter-spacing:-.032em;font-weight:560;text-wrap:balance;margin-bottom:24px}
.mv-landing h1 .accent{color:var(--plum)}
.mv-landing h1 .accent.hand{color:var(--ink);position:relative;display:inline-block;isolation:isolate}
.mv-landing h1 .accent.hand::before{content:'';position:absolute;inset:0;width:calc(100% + 1ch);left:-.25ch;height:110%;top:-5%;border-bottom-right-radius:20px 30px;background-color:var(--mark);opacity:.78;box-shadow:inset -2px 0 1px #4f2041,inset -4px 0 6px #4f2041;filter:url(#hero-rough);z-index:-1}
.mv-landing h1 .accent.hand::after{content:'';position:absolute;height:1ch;width:.5ch;top:2px;right:-.25em;background:radial-gradient(#4f2041,#a85b90);opacity:.4;border-radius:10px 0 50px/200px 0;rotate:15deg;filter:url(#hero-rough);z-index:-1}
.mv-landing .sub{font-size:19px;color:var(--ink-soft);max-width:46ch;margin-bottom:20px}
.mv-landing .prov{font-size:14px;color:var(--ink-faint);max-width:52ch;margin-bottom:32px}
.mv-landing .cta-row{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.mv-landing .cta{display:inline-flex;align-items:center;gap:9px;background:var(--plum);color:var(--cta-ink);border-radius:999px;padding:15px 28px;font-size:15.5px;font-weight:560;transition:transform .35s var(--ease),filter .35s var(--ease)}
.mv-landing .cta:hover{transform:translateY(-1px);filter:brightness(1.06)}
.mv-landing .cta .arw{transition:transform .35s var(--ease)}
.mv-landing .cta:hover .arw{transform:translateX(3px)}
.mv-landing .meta{font-size:13px;color:var(--ink-faint)}

/* stage + panel + paper grain */
.mv-landing .stage{position:relative;isolation:isolate;margin-top:44px;border:1px solid var(--line);border-radius:18px;background-color:var(--paper);overflow:hidden;padding:0}
.mv-landing .stage::before,.mv-landing .surface::before,.mv-landing .ftable::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;z-index:-1;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.86' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");opacity:.045;mix-blend-mode:multiply}
@media (prefers-color-scheme:dark){.mv-landing .stage::before,.mv-landing .surface::before,.mv-landing .ftable::before{opacity:.08;mix-blend-mode:screen}}
:root[data-theme="dark"] .mv-landing .stage::before,:root[data-theme="dark"] .mv-landing .surface::before,:root[data-theme="dark"] .mv-landing .ftable::before{opacity:.08;mix-blend-mode:screen}
:root[data-theme="light"] .mv-landing .stage::before,:root[data-theme="light"] .mv-landing .surface::before,:root[data-theme="light"] .mv-landing .ftable::before{opacity:.045;mix-blend-mode:multiply}
.mv-landing .panel{position:relative;background-color:transparent;border:0;border-radius:0;padding:36px 38px 32px}
.mv-landing .panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid var(--line-soft);flex-wrap:wrap}
.mv-landing .p-label{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:10px}
.mv-landing .verdict{display:inline-flex;align-items:center;gap:11px;font-size:31px;line-height:1.05;font-weight:600;letter-spacing:-.02em;transition:color .4s var(--ease),opacity .15s var(--ease)}
.mv-landing .verdict .vd{width:12px;height:12px;border-radius:999px;transition:background .4s var(--ease)}
.mv-landing .v-possible{color:var(--possible)} .mv-landing .v-possible .vd{background:var(--possible)}
.mv-landing .v-strong{color:var(--strong)} .mv-landing .v-strong .vd{background:var(--strong)}
.mv-landing .v-reach{color:var(--reach)} .mv-landing .v-reach .vd{background:var(--reach)}
.mv-landing .p-note{font-size:14px;color:var(--ink-soft);margin-top:10px;max-width:34ch;transition:opacity .15s var(--ease)}
.mv-landing .panel-head.swapping .verdict,.mv-landing .panel-head.swapping .p-note{opacity:.2}
.mv-landing .head-right{display:flex;flex-direction:column;align-items:flex-end;gap:12px}
.mv-landing .p-badge{font-family:var(--mono);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-faint);border:1px solid var(--line);border-radius:999px;padding:5px 11px;white-space:nowrap}
.mv-landing .toggle{display:inline-flex;background-color:var(--frame);border:1px solid var(--line);border-radius:999px;padding:3px}
.mv-landing .toggle-opt{display:inline-flex}
.mv-landing .toggle-opt > span{font-size:12.5px;padding:7px 14px;border-radius:999px;color:var(--ink-soft);transition:background .3s var(--ease),color .3s var(--ease);white-space:nowrap}
.mv-landing .toggle-opt.on > span{background:var(--plum);color:var(--cta-ink)}
.mv-landing .toggle-lbl{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:-4px}
.mv-landing .panel-body{display:grid;grid-template-columns:1.5fr 1fr;gap:40px;padding-top:22px}
.mv-landing .dims{display:flex;flex-direction:column}
.mv-landing .dim{border-bottom:1px solid var(--line-soft)}
.mv-landing .dim:last-child{border-bottom:0}
.mv-landing .dim-head{width:100%;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;padding:13px 2px 11px;text-align:left;transition:opacity .2s;cursor:pointer}
.mv-landing .dim-head:hover{opacity:.72}
.mv-landing .dim-name{font-size:15px;font-weight:500}
.mv-landing .tag{font-family:var(--mono);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;padding:3px 9px;border-radius:999px;transition:color .4s,background .4s}
.mv-landing .t-strong{color:var(--strong);background:color-mix(in srgb,var(--strong) 13%,transparent)}
.mv-landing .t-possible{color:var(--possible);background:color-mix(in srgb,var(--possible) 14%,transparent)}
.mv-landing .t-reach{color:var(--reach);background:color-mix(in srgb,var(--reach) 13%,transparent)}
.mv-landing .chev{color:var(--ink-faint);font-size:16px;transition:transform .3s var(--ease);line-height:1}
.mv-landing details[open] > .step-head .chev,.mv-landing details[open] > .frow .fchev,.mv-landing .dim.open .chev{transform:rotate(90deg)}
.mv-landing .bar{height:6px;border-radius:999px;background:color-mix(in srgb,var(--ink) 8%,transparent);overflow:hidden;margin-bottom:2px}
.mv-landing .fill{display:block;height:100%;border-radius:999px;transition:width .6s var(--ease),background .4s var(--ease)}
.mv-landing .f-strong{background:var(--strong)} .mv-landing .f-possible{background:var(--possible)} .mv-landing .f-reach{background:var(--reach)}
.mv-landing .dim-detail{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s var(--ease)}
.mv-landing .dim.open > .dim-detail{grid-template-rows:1fr}
.mv-landing .dim-detail-inner{overflow:hidden}
.mv-landing .dim-detail p{font-size:13px;color:var(--ink-soft);line-height:1.5;padding:4px 2px 14px;max-width:42ch}
.mv-landing .p-side{border-left:1px solid var(--line-soft);padding-left:30px;display:flex;flex-direction:column;justify-content:center}
.mv-landing .cost-lbl{font-size:13.5px;color:var(--ink-soft);margin-bottom:6px}
.mv-landing .cost-val{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:28px;font-weight:600;letter-spacing:-.01em;line-height:1}
.mv-landing .p-more{font-size:13.5px;color:var(--plum);font-weight:550;margin-top:16px;display:inline-flex;align-items:center;gap:6px}
.mv-landing .hint{font-size:12px;color:var(--ink-faint);margin-top:14px;font-style:italic}

/* proof strip */
.mv-landing .proof{margin-top:30px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 0}
.mv-landing .pf{display:flex;align-items:center;gap:9px;padding:0 20px;font-size:13.5px;color:var(--ink-soft);border-left:1px solid var(--line-soft);line-height:1.35}
.mv-landing .pf:first-child{border-left:0;padding-left:2px}
.mv-landing .pf .dot{width:5px;height:5px;border-radius:999px;background:var(--strong);flex:0 0 auto}

/* repeating product sections */
.mv-landing .psec{padding:96px 0 0}
.mv-landing .psec > .wrap{border-top:1px solid var(--line-soft);padding-top:88px}
.mv-landing .section-eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:24px}
.mv-landing .split{display:grid;grid-template-columns:minmax(340px,.9fr) minmax(560px,1.25fr);gap:72px;align-items:center;min-height:480px}
.mv-landing .split.rev{grid-template-columns:minmax(560px,1.25fr) minmax(340px,.9fr)}
.mv-landing .split.rev .s-copy{order:2}
.mv-landing .s-copy h2{font-size:clamp(38px,4.2vw,58px);letter-spacing:-.028em;font-weight:580;line-height:1.02;text-wrap:balance}
.mv-landing .s-lede{font-size:19px;color:var(--ink-soft);line-height:1.48;max-width:38ch;margin:22px 0 30px}
.mv-landing .s-copy .lnk{font-size:14px;color:var(--plum);font-weight:550;display:inline-flex;align-items:center;gap:6px}
.mv-landing .s-copy .lnk .arw{transition:transform .35s var(--ease)}
.mv-landing .s-copy .lnk:hover .arw{transform:translateX(3px)}
.mv-landing .surface{position:relative;isolation:isolate;background-color:var(--frame);border:1px solid var(--line);border-radius:18px}

/* plan steps */
.mv-landing .steps{padding:24px}
.mv-landing .step{border-bottom:1px solid var(--line-soft)}
.mv-landing .step:last-child{border-bottom:0}
.mv-landing .step-head{width:100%;display:grid;grid-template-columns:20px 1fr auto auto;align-items:center;gap:13px;padding:19px 18px;text-align:left;transition:opacity .2s;cursor:pointer;list-style:none}
.mv-landing .step-head::-webkit-details-marker{display:none}
.mv-landing .step-head:hover{opacity:.75}
.mv-landing .step-n{font-family:var(--mono);font-size:12px;color:var(--ink-faint)}
.mv-landing .step.now .step-n{color:var(--plum)}
.mv-landing .step-t{font-size:14.5px;font-weight:500}
.mv-landing .step-pill{font-family:var(--mono);font-size:10px;letter-spacing:.07em;text-transform:uppercase;padding:3px 9px;border-radius:999px;color:var(--ink-faint);border:1px solid var(--line)}
.mv-landing .step.done .step-pill{color:var(--strong);border-color:transparent;background:color-mix(in srgb,var(--strong) 13%,transparent)}
.mv-landing .step.now .step-pill{color:var(--cta-ink);background:var(--plum);border-color:transparent}
.mv-landing .step-detail{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s var(--ease)}
.mv-landing details[open].step .step-detail{grid-template-rows:1fr}
.mv-landing .step-detail-inner{overflow:hidden}
.mv-landing .step-detail p{font-size:13px;color:var(--ink-soft);line-height:1.5;padding:2px 12px 14px 51px;max-width:46ch}
.mv-landing .step-detail .cite,.mv-landing .dim-detail .cite{font-family:var(--mono);color:var(--ink-faint);font-size:11px}

/* checklist */
.mv-landing .checklist{padding:32px}
.mv-landing .cl-top{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}
.mv-landing .cl-count{font-size:13.5px;font-weight:550}
.mv-landing .cl-count b{color:var(--plum);font-variant-numeric:tabular-nums}
.mv-landing .ready-pill{font-family:var(--mono);font-size:10px;letter-spacing:.07em;text-transform:uppercase;padding:4px 10px;border-radius:999px;color:var(--strong);background:color-mix(in srgb,var(--strong) 14%,transparent);opacity:0;transform:translateY(-2px);transition:opacity .35s var(--ease),transform .35s var(--ease)}
.mv-landing .checklist.alldone .ready-pill{opacity:1;transform:none}
.mv-landing .cl-bar{height:7px;border-radius:999px;background:color-mix(in srgb,var(--ink) 8%,transparent);overflow:hidden;margin-bottom:8px}
.mv-landing .cl-fill{display:block;height:100%;border-radius:999px;background:var(--plum);transition:width .45s var(--ease),background .45s var(--ease)}
.mv-landing .checklist.alldone .cl-fill{background:var(--strong)}
.mv-landing .ck-row{width:100%;display:flex;align-items:center;gap:12px;padding:13px 4px;border-bottom:1px solid var(--line-soft);text-align:left;font-size:14px;transition:opacity .2s;cursor:pointer}
.mv-landing .ck-row:last-child{border-bottom:0}
.mv-landing .ck-row:hover{opacity:.82}
.mv-landing .ck-box{width:18px;height:18px;border-radius:5px;border:1.6px solid var(--line);flex:0 0 auto;position:relative;transition:background .25s var(--ease),border-color .25s var(--ease)}
.mv-landing .ck-row.done .ck-box{background:var(--strong);border-color:var(--strong)}
.mv-landing .ck-row.done .ck-box::after{content:"";position:absolute;left:5.5px;top:2px;width:4px;height:8px;border:solid var(--paper);border-width:0 2px 2px 0;transform:rotate(42deg)}
.mv-landing .ck-label{flex:1}
.mv-landing .ck-row.done .ck-label{color:var(--ink-faint);text-decoration:line-through;text-decoration-color:var(--line)}
.mv-landing .ck-src{font-family:var(--mono);font-size:10.5px;color:var(--ink-faint);white-space:nowrap}
@media (prefers-reduced-motion:no-preference){.mv-landing .ck-row.done .ck-box{animation:pop .3s var(--ease)}}
@keyframes pop{0%{transform:scale(1)}45%{transform:scale(1.08)}100%{transform:scale(1)}}

/* guide */
.mv-landing .guide-panel{padding:32px}
.mv-landing .g-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.mv-landing .g-chip{display:inline-flex}
.mv-landing .g-chip > span{font-size:12.5px;padding:8px 13px;border-radius:999px;border:1px solid var(--line);color:var(--ink-soft);transition:background .25s,color .25s,border-color .25s;cursor:pointer}
.mv-landing .g-chip.on > span{background:var(--plum);color:var(--cta-ink);border-color:transparent}
.mv-landing .g-thread{display:flex;flex-direction:column;gap:12px;min-height:230px}
.mv-landing .g-q{align-self:flex-end;max-width:82%;background:var(--plum);color:var(--cta-ink);border-radius:14px 14px 4px 14px;padding:11px 15px;font-size:13.5px}
.mv-landing .g-a{align-self:flex-start;max-width:90%;background-color:var(--paper);border:1px solid var(--line);border-radius:14px 14px 14px 4px;padding:13px 16px;font-size:13.5px;color:var(--ink);line-height:1.55}
.mv-landing .g-a .cite{display:block;margin-top:9px;font-family:var(--mono);font-size:10.5px;color:var(--ink-faint);opacity:0;transition:opacity .22s var(--ease)}
.mv-landing .g-a .cite.in{opacity:1}
.mv-landing .g-typing{align-self:flex-start;display:inline-flex;gap:4px;align-items:center;background-color:var(--paper);border:1px solid var(--line);border-radius:14px 14px 14px 4px;padding:14px 16px}
.mv-landing .g-typing span{width:6px;height:6px;border-radius:999px;background:var(--ink-faint);opacity:.35}
@media (prefers-reduced-motion:no-preference){.mv-landing .g-typing span{animation:gdot .9s var(--ease) infinite}.mv-landing .g-typing span:nth-child(2){animation-delay:.15s}.mv-landing .g-typing span:nth-child(3){animation-delay:.3s}}
@keyframes gdot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}

/* freshness band */
.mv-landing .fresh{margin-top:120px;border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft);padding:84px 0}
.mv-landing .fresh .fh{text-align:center;margin-bottom:40px}
.mv-landing .fresh h2{font-size:clamp(32px,3.4vw,46px);letter-spacing:-.026em;font-weight:580;line-height:1.05;margin-bottom:14px}
.mv-landing .fresh .lede{color:var(--ink-soft);font-size:17px;max-width:54ch;margin:0 auto;line-height:1.5}
.mv-landing .ftable{position:relative;isolation:isolate;max-width:820px;margin:0 auto;border:1px solid var(--line);border-radius:16px;overflow:hidden;background-color:var(--frame)}
.mv-landing .fitem{border-bottom:1px solid var(--line-soft)}
.mv-landing .fitem:last-child{border-bottom:0}
.mv-landing .frow{position:relative;width:100%;display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:20px;padding:16px 22px;text-align:left;background:none;border:0;transition:background-color .6s var(--ease);cursor:pointer;list-style:none}
.mv-landing .frow::-webkit-details-marker{display:none}
.mv-landing .frow .fk{font-size:14px}
.mv-landing .frow .fv{font-family:var(--mono);font-size:13px;font-variant-numeric:tabular-nums;text-align:right}
.mv-landing .frow .fd{font-family:var(--mono);font-size:11px;color:var(--ink-faint);white-space:nowrap;display:inline-flex;align-items:center}
.mv-landing .frow.lit,.mv-landing .frow:hover{background-color:color-mix(in srgb,var(--plum) 7%,transparent)}
.mv-landing .vdot{display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--strong);margin-right:8px;opacity:0}
.mv-landing .frow.verified .vdot{opacity:.55}
@media (prefers-reduced-motion:no-preference){.mv-landing .frow.verified .vdot{animation:vpulse .7s var(--ease)}}
@keyframes vpulse{0%{opacity:0;transform:scale(.5)}45%{opacity:1;transform:scale(1.35)}100%{opacity:.55;transform:scale(1)}}
.mv-landing .fchev{color:var(--ink-faint);font-size:15px;line-height:1;transition:transform .3s var(--ease)}
.mv-landing .fdetail{display:grid;grid-template-rows:0fr;transition:grid-template-rows .28s var(--ease)}
.mv-landing details[open].fitem .fdetail{grid-template-rows:1fr}
.mv-landing .fdetail-inner{overflow:hidden}
.mv-landing .fdetail p{font-size:12.5px;color:var(--ink-soft);line-height:1.6;padding:0 22px 16px;max-width:64ch}
.mv-landing .fdetail .fmeta{display:block;margin-top:7px;font-family:var(--mono);font-size:10.5px;color:var(--ink-faint);letter-spacing:.04em}
.mv-landing .fresh .foot{text-align:center;font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin-top:24px;letter-spacing:.07em}

/* close */
.mv-landing .close{padding:130px 0 140px;text-align:center}
.mv-landing .close h2{font-size:clamp(34px,4.6vw,56px);letter-spacing:-.03em;font-weight:580;margin-bottom:28px;text-wrap:balance}
.mv-landing .close .meta{margin-top:20px}

/* sparkle CTA (scoped flourish; retuned to dusk-plum hue 320) */
.mv-landing .sparkle-cta{--transition:.25s;--spark:1.8s;position:relative;display:inline-block;isolation:isolate}
.mv-landing .sparkle-cta .s-btn{--hue:320;--cut:.1em;--active:0;--bg:radial-gradient(40% 50% at center 100%, hsl(var(--hue) calc(var(--active)*52%) 56% / var(--active)), transparent),radial-gradient(80% 100% at center 120%, hsl(var(--hue) calc(var(--active)*52%) 48% / var(--active)), transparent),hsl(var(--hue) calc(var(--active)*48%) calc((var(--active)*13%) + 22%));background:var(--bg);font-family:var(--sans);font-size:1.4rem;font-weight:560;letter-spacing:-.01em;color:hsl(0 0% 92%);border:0;cursor:pointer;padding:.8em 1.4em;display:inline-flex;align-items:center;gap:.4em;white-space:nowrap;border-radius:999px;position:relative;box-shadow:0 0 calc(var(--active)*4.2em) calc(var(--active)*1.6em) hsl(var(--hue) 52% 40% / .5),0 .05em 0 0 hsl(var(--hue) calc(var(--active)*55%) calc((var(--active)*34%)+34%)) inset,0 -.05em 0 0 hsl(var(--hue) calc(var(--active)*55%) calc(var(--active)*40%)) inset;transition:box-shadow var(--transition),scale var(--transition),background var(--transition);scale:calc(1 + (var(--active)*.08))}
.mv-landing .sparkle-cta .s-btn:active{scale:1}
.mv-landing .sparkle-cta .s-btn:is(:hover,:focus-visible){--active:1}
.mv-landing .sparkle-cta svg{overflow:visible !important}
.mv-landing .sparkle-cta .s-btn svg.sparkle{position:relative;z-index:2;inline-size:1.1em;translate:0 -2%}
.mv-landing .sparkle-cta .sparkle path{color:hsl(0 0% calc((var(--active,0)*70%) + var(--base)));transform-box:fill-box;transform-origin:center;fill:currentColor;stroke:currentColor;animation-delay:calc((var(--transition)*1.5) + (var(--delay)*1s));animation-duration:.6s;transition:color var(--transition)}
.mv-landing .sparkle-cta .s-btn:is(:hover,:focus-visible) .sparkle path{animation-name:cta-bounce}
@keyframes cta-bounce{35%,65%{scale:var(--scale)}}
.mv-landing .sparkle-cta .sparkle path:nth-of-type(1){--scale:.5;--delay:.1;--base:40%}
.mv-landing .sparkle-cta .sparkle path:nth-of-type(2){--scale:1.5;--delay:.2;--base:20%}
.mv-landing .sparkle-cta .sparkle path:nth-of-type(3){--scale:2.5;--delay:.35;--base:30%}
.mv-landing .sparkle-cta .s-btn:before{content:"";position:absolute;inset:-.25em;z-index:-1;border:.25em solid hsl(var(--hue) 50% 42% / .45);border-radius:999px;opacity:var(--active,0);transition:opacity var(--transition)}
.mv-landing .sparkle-cta .spark{position:absolute;inset:0;border-radius:999px;rotate:0deg;overflow:hidden;-webkit-mask:linear-gradient(white, transparent 50%);mask:linear-gradient(white, transparent 50%);animation:none}
@keyframes cta-flip{to{rotate:360deg}}
.mv-landing .sparkle-cta .spark:before{content:"";position:absolute;width:200%;aspect-ratio:1;top:0;left:50%;z-index:-1;translate:-50% -15%;transform:rotate(-90deg);opacity:var(--active,0);background:conic-gradient(from 0deg, transparent 0 340deg, white 360deg);transition:opacity var(--transition);animation:none}
.mv-landing .sparkle-cta.live .spark{animation:cta-flip calc(var(--spark)*2) infinite steps(2,end)}
.mv-landing .sparkle-cta.live .spark:before{animation:cta-rotate var(--spark) linear infinite both;opacity:calc(var(--active,0) + .4);will-change:transform}
@keyframes cta-rotate{to{transform:rotate(90deg)}}
.mv-landing .sparkle-cta .backdrop{position:absolute;inset:var(--cut);background:var(--bg);border-radius:999px;transition:background var(--transition)}
.mv-landing .sparkle-cta .text{position:relative;z-index:2;letter-spacing:.01ch;color:hsl(0 0% calc(92% + (var(--active)*8%)));transition:color var(--transition)}
.mv-landing .sparkle-cta .s-btn:is(:hover,:focus-visible) ~ .particle-pen{--active:1;--play-state:running}
.mv-landing .sparkle-cta .particle-pen{position:absolute;width:200%;aspect-ratio:1;top:50%;left:50%;translate:-50% -50%;-webkit-mask:radial-gradient(white, transparent 65%);mask:radial-gradient(white, transparent 65%);z-index:-1;opacity:var(--active,0);transition:opacity var(--transition);pointer-events:none}
.mv-landing .sparkle-cta .particle{fill:white;width:calc(var(--size,.25)*1rem);aspect-ratio:1;position:absolute;top:calc(var(--y)*1%);left:calc(var(--x)*1%);opacity:var(--alpha,1);animation:cta-float calc(var(--duration,1)*1s) calc(var(--delay)*-1s) infinite linear;transform-origin:var(--origin-x,1000%) var(--origin-y,1000%);z-index:-1;animation-play-state:var(--play-state,paused)}
.mv-landing .sparkle-cta .particle path{fill:hsl(var(--hue) 40% 88%);stroke:none}
.mv-landing .sparkle-cta .particle:nth-of-type(even){animation-direction:reverse}
@keyframes cta-float{to{rotate:360deg}}
@media (prefers-reduced-motion:reduce){.mv-landing .sparkle-cta .spark,.mv-landing .sparkle-cta .spark:before,.mv-landing .sparkle-cta .particle,.mv-landing .sparkle-cta .sparkle path{animation:none}.mv-landing .sparkle-cta .particle-pen{display:none}}

/* scroll reveals — hidden state only after JS sets .hidden (never hides no-JS content) */
@media (prefers-reduced-motion:no-preference){
  .mv-landing .mv-reveal.hidden{opacity:0;transform:translateY(18px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
  .mv-landing .mv-reveal.in{opacity:1;transform:none;transition:opacity .7s var(--ease),transform .7s var(--ease)}
}

/* responsive — breakpoint of record 860px */
@media (max-width:860px){
  .mv-landing .panel-body{grid-template-columns:1fr;gap:26px}
  .mv-landing .p-side{border-left:0;border-top:1px solid var(--line-soft);padding-left:0;padding-top:24px}
  .mv-landing .split,.mv-landing .split.rev{grid-template-columns:1fr;gap:42px;min-height:auto}
  .mv-landing .split.rev .s-copy{order:0}
  .mv-landing .s-copy h2{font-size:clamp(34px,9vw,46px)}
  .mv-landing .steps,.mv-landing .checklist,.mv-landing .guide-panel{padding:24px}
  .mv-landing .proof{flex-direction:column;align-items:flex-start;gap:12px}
  .mv-landing .pf{border-left:0;padding-left:2px}
  .mv-landing .panel-head{flex-direction:column}
  .mv-landing .head-right{align-items:flex-start}
  .mv-landing .frow{grid-template-columns:1fr auto;gap:4px 14px;padding:14px 18px}
  .mv-landing .frow .fk{grid-column:1}
  .mv-landing .frow .fv{grid-column:2;text-align:right}
  .mv-landing .frow .fd{grid-column:1}
  .mv-landing .frow .fchev{grid-column:2;text-align:right;align-self:center}
  .mv-landing .fdetail p{padding:0 18px 14px}
}
@media (prefers-reduced-motion:reduce){
  .mv-landing .fill,.mv-landing .verdict,.mv-landing .p-note,.mv-landing .tag,.mv-landing .chev,.mv-landing .dim-detail,.mv-landing .cta,.mv-landing .cl-fill,.mv-landing .step-detail,.mv-landing .ck-box,.mv-landing .frow,.mv-landing .g-chip,.mv-landing .ready-pill,.mv-landing .mv-reveal,.mv-landing .g-typing,.mv-landing .g-typing span,.mv-landing .vdot,.mv-landing .fdetail,.mv-landing .fchev{transition:none;animation:none}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/styles/landing-css.test.ts`
Expected: PASS (7 assertions green).

- [ ] **Step 5: Commit**

```bash
git add app/(marketing)/landing.css tests/styles/landing-css.test.ts
git commit -m "feat(landing): scoped v7 marketing CSS + tokens (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 (B): Shared provenance types

**Files:**
- Create: `lib/marketing/provenance.ts`
- Test: `tests/marketing/provenance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/provenance.test.ts
import { describe, it, expect } from "vitest";
import { isSourced, isSample, type Sourced, type Sample } from "@/lib/marketing/provenance";

describe("marketing provenance types", () => {
  it("isSourced narrows kind:'sourced' and requires source + verified", () => {
    const s: Sourced = { kind: "sourced", source: "Home Affairs", verified: "Jun 2026" };
    expect(isSourced(s)).toBe(true);
    expect(isSample(s)).toBe(false);
  });

  it("isSample narrows kind:'sample'", () => {
    const s: Sample = { kind: "sample" };
    expect(isSample(s)).toBe(true);
    expect(isSourced(s)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/marketing/provenance.test.ts`
Expected: FAIL — cannot resolve `@/lib/marketing/provenance`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/marketing/provenance.ts

/** Visual tone shared by verdicts, dimension tags, and fills. */
export type Tone = "strong" | "possible" | "reach";

/** Panel-level verdict word (never "Watch"). */
export type VerdictWord = "Strong" | "Possible" | "Reach";

/** Per-dimension tag (may be "Watch" for an amber-risk dimension). */
export type DimTag = "Strong" | "Possible" | "Watch";

/** Plan-step lifecycle state. */
export type StepState = "Done" | "Now" | "Next" | "Later";

/** Guide exchange identifiers. `gte` is an internal key only; no user copy says GTE. */
export type GuideKey = "ielts" | "funds" | "gte";

/** A real-world claim: always carries its origin and a verified month. */
export interface Sourced {
  kind: "sourced";
  /** e.g. "Home Affairs", "University data". */
  source: string;
  /** e.g. "Jun 2026". */
  verified: string;
}

/** Illustrative demo data: never carries a sourced verification. */
export interface Sample {
  kind: "sample";
}

export function isSourced(x: { kind: string }): x is Sourced {
  return x.kind === "sourced";
}

export function isSample(x: { kind: string }): x is Sample {
  return x.kind === "sample";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/marketing/provenance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/provenance.ts tests/marketing/provenance.test.ts
git commit -m "feat(landing): shared sample/sourced provenance types (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 (B): Sample profiles data

**Files:**
- Create: `lib/marketing/sample-profiles.ts`
- Test: `tests/marketing/sample-profiles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/sample-profiles.test.ts
import { describe, it, expect } from "vitest";
import { SAMPLE_PROFILES, getProfile, formatCost } from "@/lib/marketing/sample-profiles";

describe("sample profiles", () => {
  it("ships exactly two profiles, both kind:'sample'", () => {
    expect(SAMPLE_PROFILES).toHaveLength(2);
    for (const p of SAMPLE_PROFILES) expect(p.kind).toBe("sample");
  });

  it("Aarav is GPA 3.2 -> Possible, ~A$42,600; Shruti is GPA 3.8 -> Strong, ~A$44,200", () => {
    const aarav = getProfile("aarav");
    const shruti = getProfile("shruti");
    expect(aarav.label).toBe("Aarav · GPA 3.2");
    expect(aarav.verdict).toBe("Possible");
    expect(aarav.cost).toBe(42600);
    expect(shruti.label).toBe("Shruti · GPA 3.8");
    expect(shruti.verdict).toBe("Strong");
    expect(shruti.cost).toBe(44200);
  });

  it("every profile has 4 dims (Academic/English/Finances/Visa risk) and no citation fields", () => {
    for (const p of SAMPLE_PROFILES) {
      expect(p.dims.map((d) => d.name)).toEqual(["Academic", "English", "Finances", "Visa risk"]);
      for (const d of p.dims) {
        expect(d.width).toBeGreaterThan(0);
        expect("cite" in d).toBe(false);
        expect("verified" in d).toBe(false);
      }
    }
  });

  it("formatCost renders a non-sourced approximate estimate", () => {
    expect(formatCost(42600)).toBe("≈ A$42,600");
    expect(formatCost(44200)).toBe("≈ A$44,200");
  });

  it("getProfile returns the matching profile, defaulting handled by caller", () => {
    expect(getProfile("shruti").id).toBe("shruti");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/marketing/sample-profiles.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/marketing/sample-profiles.ts
import type { Sample, Tone, VerdictWord, DimTag } from "./provenance";

export interface Dimension {
  key: "academic" | "english" | "finances" | "visa";
  name: string;
  tag: DimTag;
  tone: Tone;
  width: number;
  blurb: string;
}

export interface SampleProfile extends Sample {
  id: "aarav" | "shruti";
  label: string;
  verdict: VerdictWord;
  tone: Tone;
  note: string;
  cost: number;
  dims: Dimension[];
}

export const formatCost = (n: number): string => `≈ A$${n.toLocaleString("en-US")}`;

export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    kind: "sample",
    id: "aarav",
    label: "Aarav · GPA 3.2",
    verdict: "Possible",
    tone: "possible",
    note: "A realistic path, with two things to strengthen before you apply.",
    cost: 42600,
    dims: [
      { key: "academic", name: "Academic", tag: "Strong", tone: "strong", width: 82, blurb: "Your GPA maps to a competitive band for your target programs." },
      { key: "english", name: "English", tag: "Possible", tone: "possible", width: 58, blurb: "IELTS 6.5 meets the minimum; 7.0 would widen your options." },
      { key: "finances", name: "Finances", tag: "Possible", tone: "possible", width: 64, blurb: "Shown funds against the A$29,710 living requirement plus tuition." },
      { key: "visa", name: "Visa risk", tag: "Watch", tone: "reach", width: 41, blurb: "Your profile has watch-points across the Genuine Student (GS) factors an officer weighs." },
    ],
  },
  {
    kind: "sample",
    id: "shruti",
    label: "Shruti · GPA 3.8",
    verdict: "Strong",
    tone: "strong",
    note: "A strong position across the board. You can apply with confidence.",
    cost: 44200,
    dims: [
      { key: "academic", name: "Academic", tag: "Strong", tone: "strong", width: 91, blurb: "A high GPA places you above typical entry for these programs." },
      { key: "english", name: "English", tag: "Strong", tone: "strong", width: 88, blurb: "IELTS 7.5 clears every program on your shortlist." },
      { key: "finances", name: "Finances", tag: "Strong", tone: "strong", width: 79, blurb: "Shown funds comfortably cover living costs plus tuition." },
      { key: "visa", name: "Visa risk", tag: "Possible", tone: "possible", width: 62, blurb: "Genuine Student (GS) factors are solid; keep your study intent well documented." },
    ],
  },
];

export function getProfile(id: SampleProfile["id"]): SampleProfile {
  return SAMPLE_PROFILES.find((p) => p.id === id) ?? SAMPLE_PROFILES[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/marketing/sample-profiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/sample-profiles.ts tests/marketing/sample-profiles.test.ts
git commit -m "feat(landing): sample profile demo data (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 (B): Plan steps data

**Files:**
- Create: `lib/marketing/plan-steps.ts`
- Test: `tests/marketing/plan-steps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/plan-steps.test.ts
import { describe, it, expect } from "vitest";
import { PLAN_STEPS } from "@/lib/marketing/plan-steps";

describe("plan steps", () => {
  it("ships exactly five steps numbered 01..05", () => {
    expect(PLAN_STEPS).toHaveLength(5);
    expect(PLAN_STEPS.map((s) => s.n)).toEqual(["01", "02", "03", "04", "05"]);
  });

  it("step 02 is the one open at rest, and is the 'Now' step", () => {
    const open = PLAN_STEPS.filter((s) => s.open);
    expect(open).toHaveLength(1);
    expect(open[0].n).toBe("02");
    expect(open[0].state).toBe("Now");
  });

  it("every sourced step renders a 'Source: ... · <month>' citation", () => {
    for (const s of PLAN_STEPS) {
      if (s.cite.startsWith("Source:")) expect(s.cite).toMatch(/·\s*\w+\s*\d{4}$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/marketing/plan-steps.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/marketing/plan-steps.ts
import type { StepState } from "./provenance";

export interface PlanStep {
  n: string;
  title: string;
  state: StepState;
  detail: string;
  cite: string;
  open?: boolean;
}

export const PLAN_STEPS: PlanStep[] = [
  { n: "01", title: "Confirm your eligibility", state: "Done", detail: "Your 9-question assessment placed you in the Possible band.", cite: "Status: completed" },
  { n: "02", title: "Shortlist programs that fit", state: "Now", detail: "We match your profile to programs you can realistically enter, ranked by fit, cost, and intake.", cite: "Source: University data · Jun 2026", open: true },
  { n: "03", title: "Sit IELTS or PTE", state: "Next", detail: "Target the band your shortlist needs: 6.5, with 7.0 opening more options.", cite: "Source: Home Affairs · Jun 2026" },
  { n: "04", title: "Prepare financial evidence", state: "Next", detail: "Evidence A$29,710 living costs plus one year's tuition, genuine and available.", cite: "Source: Home Affairs s.500 · Jun 2026" },
  { n: "05", title: "Lodge your student visa", state: "Later", detail: "Apply once your offer and CoE are in hand, with your Genuine Student (GS) statement documented.", cite: "Source: Home Affairs · Jun 2026" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/marketing/plan-steps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/plan-steps.ts tests/marketing/plan-steps.test.ts
git commit -m "feat(landing): plan-step data, step 02 open (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 (B): Checklist items data

**Files:**
- Create: `lib/marketing/checklist-items.ts`
- Test: `tests/marketing/checklist-items.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/checklist-items.test.ts
import { describe, it, expect } from "vitest";
import { CHECKLIST_ITEMS } from "@/lib/marketing/checklist-items";

describe("checklist items", () => {
  it("ships exactly six items with exactly two done at rest", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(6);
    expect(CHECKLIST_ITEMS.filter((i) => i.done)).toHaveLength(2);
  });

  it("every item carries a source label", () => {
    for (const i of CHECKLIST_ITEMS) expect(i.source).toMatch(/·\s*\w+\s*\d{4}$/);
  });

  it("uses Genuine Student (GS), never GTE", () => {
    const blob = JSON.stringify(CHECKLIST_ITEMS);
    expect(blob).not.toMatch(/GTE/);
    expect(blob).toMatch(/Genuine Student \(GS\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/marketing/checklist-items.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/marketing/checklist-items.ts

export interface ChecklistItem {
  label: string;
  source: string;
  done: boolean;
}

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { label: "Academic transcript verified", source: "University · Jun 2026", done: true },
  { label: "IELTS 6.5 recorded", source: "Home Affairs · Jun 2026", done: true },
  { label: "Financial evidence: A$29,710", source: "Home Affairs · Jun 2026", done: false },
  { label: "Genuine Student (GS) statement drafted", source: "Home Affairs · Jun 2026", done: false },
  { label: "Confirmation of Enrolment (CoE)", source: "Provider · Jun 2026", done: false },
  { label: "OSHC health cover arranged", source: "Home Affairs · Jun 2026", done: false },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/marketing/checklist-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/checklist-items.ts tests/marketing/checklist-items.test.ts
git commit -m "feat(landing): checklist item data, 2/6 done (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6 (B): Guide answers data

**Files:**
- Create: `lib/marketing/guide-answers.ts`
- Test: `tests/marketing/guide-answers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/guide-answers.test.ts
import { describe, it, expect } from "vitest";
import { GUIDE_ANSWERS, GUIDE_ORDER } from "@/lib/marketing/guide-answers";

describe("guide answers", () => {
  it("has exactly the three approved exchanges in order, ielts first", () => {
    expect(GUIDE_ORDER).toEqual(["ielts", "funds", "gte"]);
    expect(Object.keys(GUIDE_ANSWERS).sort()).toEqual(["funds", "gte", "ielts"]);
  });

  it("every exchange has a chip label, first-person question, answer, and a source+verified citation", () => {
    for (const key of GUIDE_ORDER) {
      const it = GUIDE_ANSWERS[key];
      expect(it.chip.length).toBeGreaterThan(3);
      expect(it.q.length).toBeGreaterThan(10);
      expect(it.a.length).toBeGreaterThan(20);
      expect(it.source).toMatch(/Home Affairs/);
      expect(it.verified).toBe("Jun 2026");
    }
  });

  it("uses Genuine Student wording, never user-facing GTE", () => {
    expect(JSON.stringify(GUIDE_ANSWERS)).not.toMatch(/GTE|Genuine Temporary Entrant/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/marketing/guide-answers.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/marketing/guide-answers.ts
import type { GuideKey } from "./provenance";

export interface GuideExchange {
  key: GuideKey;
  chip: string;
  q: string;
  a: string;
  source: string;
  verified: string;
}

export const GUIDE_ANSWERS: Record<GuideKey, GuideExchange> = {
  ielts: {
    key: "ielts",
    chip: "Is 6.5 enough?",
    q: "I got 6.5 overall. Is that actually enough?",
    a: "Good news for your shortlist: 6.5 overall (nothing below 6.0) already meets the bar. Pushing to 7.0 opens your reach programs and firms up your Genuine Student case.",
    source: "Home Affairs",
    verified: "Jun 2026",
  },
  funds: {
    key: "funds",
    chip: "Does the money have to be mine?",
    q: "Does the bank balance have to be my own money?",
    a: "For your Australia plan, you'd show A$29,710 in living costs plus your first-year tuition and travel, genuinely yours and available, not borrowed just for the visa.",
    source: "Home Affairs s.500",
    verified: "Jun 2026",
  },
  gte: {
    key: "gte",
    chip: "What if they think I'll migrate?",
    q: "What if they think I just want to migrate, not study?",
    a: "It comes down to whether an officer believes you mean to study, not migrate. With your profile, that's about showing why this course and why now, which is exactly what we'd help you put together.",
    source: "Home Affairs",
    verified: "Jun 2026",
  },
};

export const GUIDE_ORDER: GuideKey[] = ["ielts", "funds", "gte"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/marketing/guide-answers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/guide-answers.ts tests/marketing/guide-answers.test.ts
git commit -m "feat(landing): guide exchange data, GS wording (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7 (B): Freshness rows data

**Files:**
- Create: `lib/marketing/freshness-rows.ts`
- Test: `tests/marketing/freshness-rows.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/freshness-rows.test.ts
import { describe, it, expect } from "vitest";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";

describe("freshness rows", () => {
  it("ships exactly five sourced rows, each verified Jun 2026 / next check Jul 2026", () => {
    expect(FRESHNESS_ROWS).toHaveLength(5);
    for (const r of FRESHNESS_ROWS) {
      expect(r.kind).toBe("sourced");
      expect(r.source).toBeTruthy();
      expect(r.verified).toBe("Jun 2026");
      expect(r.nextCheck).toBe("Jul 2026");
    }
  });

  it("pins the exact sourced figures (fabrication guard)", () => {
    const byKey = Object.fromEntries(FRESHNESS_ROWS.map((r) => [r.key, r]));
    expect(byKey["Living-cost requirement"].value).toBe("A$29,710");
    expect(byKey["Living-cost requirement"].source).toBe("Home Affairs");
    expect(byKey["Genuine Student (GS)"].value).toBe("s.500 criteria");
    expect(byKey["Avg. first-year tuition"].value).toBe("≈ A$33,000");
    expect(byKey["Post-study work (485)"].value).toBe("2–4 years");
    expect(byKey["Health cover (OSHC)"].value).toBe("required");
  });

  it("never ships user-facing GTE", () => {
    expect(JSON.stringify(FRESHNESS_ROWS)).not.toMatch(/GTE|Genuine Temporary Entrant/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/marketing/freshness-rows.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

Note: `value: "2–4 years"` uses an EN dash (`–`, U+2013), which is allowed; only the EM dash (`—`, U+2014) is forbidden.

```ts
// lib/marketing/freshness-rows.ts
import type { Sourced } from "./provenance";

export interface FreshnessRow extends Sourced {
  key: string;
  value: string;
  detail: string;
  nextCheck: string;
}

export const FRESHNESS_ROWS: FreshnessRow[] = [
  {
    kind: "sourced",
    key: "Living-cost requirement",
    value: "A$29,710",
    source: "Home Affairs",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: Department of Home Affairs, the 12-month living-cost figure a student must evidence for a visa. What we check: the published amount and its effective date.",
  },
  {
    kind: "sourced",
    key: "Genuine Student (GS)",
    value: "s.500 criteria",
    source: "Home Affairs",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: Migration Regulations s.500 and Home Affairs Genuine Student guidance. What we check: the factors an officer applies to judge study intent.",
  },
  {
    kind: "sourced",
    key: "Avg. first-year tuition",
    value: "≈ A$33,000",
    source: "University data",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: published fee schedules across shortlisted universities. What we check: indicative first-year tuition, which varies by program.",
  },
  {
    kind: "sourced",
    key: "Post-study work (485)",
    value: "2–4 years",
    source: "Home Affairs",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: Home Affairs Temporary Graduate visa (subclass 485). What we check: post-study work duration by qualification level.",
  },
  {
    kind: "sourced",
    key: "Health cover (OSHC)",
    value: "required",
    source: "Home Affairs",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: Home Affairs student visa conditions. What we check: that Overseas Student Health Cover is required for the visa duration.",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/marketing/freshness-rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/freshness-rows.ts tests/marketing/freshness-rows.test.ts
git commit -m "feat(landing): sourced freshness rows (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8 (B): Copy-integrity guard (honesty + terminology + no em-dash)

One test that mechanically enforces the three cross-module copy invariants over all five data modules at once.

**Files:**
- Test: `tests/marketing/copy-integrity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/copy-integrity.test.ts
import { describe, it, expect } from "vitest";
import { SAMPLE_PROFILES } from "@/lib/marketing/sample-profiles";
import { PLAN_STEPS } from "@/lib/marketing/plan-steps";
import { CHECKLIST_ITEMS } from "@/lib/marketing/checklist-items";
import { GUIDE_ANSWERS } from "@/lib/marketing/guide-answers";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";

const ALL = JSON.stringify({ SAMPLE_PROFILES, PLAN_STEPS, CHECKLIST_ITEMS, GUIDE_ANSWERS, FRESHNESS_ROWS });

describe("landing copy integrity", () => {
  it("honesty split: samples carry no verification; sourced rows always do", () => {
    for (const p of SAMPLE_PROFILES) {
      expect(p.kind).toBe("sample");
      expect(JSON.stringify(p)).not.toMatch(/verified/i);
    }
    for (const r of FRESHNESS_ROWS) {
      expect(r.kind).toBe("sourced");
      expect(r.source.length).toBeGreaterThan(0);
      expect(r.verified.length).toBeGreaterThan(0);
    }
  });

  it("terminology: no user-facing GTE / Genuine Temporary Entrant anywhere", () => {
    expect(ALL).not.toMatch(/GTE/);
    expect(ALL).not.toMatch(/Genuine Temporary Entrant/);
  });

  it("no em-dash (U+2014) in any copy module", () => {
    expect(ALL).not.toContain("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `npm test -- tests/marketing/copy-integrity.test.ts`
Expected: PASS immediately (Tasks 3–7 already satisfy these). If it FAILS, a data module violated an invariant — fix the data, not the test.

- [ ] **Step 3: Commit**

```bash
git add tests/marketing/copy-integrity.test.ts
git commit -m "test(landing): cross-module honesty/terminology/em-dash guard (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9 (C0): Test-environment stubs for the islands

jsdom implements neither `matchMedia` nor `IntersectionObserver`. Add additive stubs so island `useEffect`s don't throw. `matches:false` (motion allowed) is the default; the IO stub **never fires**, which conveniently freezes every island at its server-rendered rest state during `render()` — exactly what we assert.

**Files:**
- Modify: `tests/setup.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/test-env.test.ts
import { describe, it, expect } from "vitest";

describe("test environment stubs", () => {
  it("exposes matchMedia defaulting to no-match", () => {
    expect(typeof window.matchMedia).toBe("function");
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
  });
  it("exposes a non-firing IntersectionObserver", () => {
    expect(typeof window.IntersectionObserver).toBe("function");
    const io = new IntersectionObserver(() => {});
    expect(() => { io.observe(document.body); io.disconnect(); }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/marketing/test-env.test.ts`
Expected: FAIL — `window.matchMedia is not a function`.

- [ ] **Step 3: Write minimal implementation**

Replace `tests/setup.ts` with:

```ts
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (!("IntersectionObserver" in window)) {
  class IOStub {
    constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  // @ts-expect-error jsdom stub
  window.IntersectionObserver = IOStub;
  // @ts-expect-error jsdom stub
  globalThis.IntersectionObserver = IOStub;
}
```

Reduced-motion interaction tests override per-test with:
`vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, /* ...rest */ } as MediaQueryList);`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/marketing/test-env.test.ts`
Expected: PASS. Also run `npm test` once to confirm no pre-existing test regressed from the setup change.

- [ ] **Step 5: Commit**

```bash
git add tests/setup.ts tests/marketing/test-env.test.ts
git commit -m "test(landing): jsdom matchMedia + IntersectionObserver stubs (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10 (C): Hero marker (server component)

**Files:**
- Create: `components/marketing/hero-marker.tsx`
- Test: `tests/components/marketing/hero-marker.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/hero-marker.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroMarker } from "@/components/marketing/hero-marker";

describe("HeroMarker", () => {
  it("wraps its children in the .accent.hand marker span (no client JS)", () => {
    const html = renderToStaticMarkup(<HeroMarker>pay anyone.</HeroMarker>);
    expect(html).toContain("pay anyone.");
    expect(html).toMatch(/class="accent hand"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/marketing/hero-marker.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/hero-marker.tsx

/** The hand-drawn hero highlight (spec §4.1). Purely presentational; the
 *  #hero-rough SVG filter is emitted once by the page. Server component. */
export function HeroMarker({ children }: { children: React.ReactNode }) {
  return <span className="accent hand">{children}</span>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/marketing/hero-marker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/hero-marker.tsx tests/components/marketing/hero-marker.test.tsx
git commit -m "feat(landing): hero marker span (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11 (C): Reveal wrapper (client island)

**Files:**
- Create: `components/marketing/reveal.tsx`
- Test: `tests/components/marketing/reveal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/reveal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { Reveal } from "@/components/marketing/reveal";

describe("Reveal", () => {
  it("server-renders children VISIBLE (no hidden class, no matchMedia/IO during render)", () => {
    const mm = vi.spyOn(window, "matchMedia");
    const html = renderToStaticMarkup(<Reveal className="fh"><p>Sourced &amp; dated</p></Reveal>);
    expect(html).toContain("Sourced &amp; dated");
    expect(html).toMatch(/class="mv-reveal fh"/);
    expect(html).not.toMatch(/hidden/);
    expect(mm).not.toHaveBeenCalled();
    mm.mockRestore();
  });

  it("under reduced motion, stays at rest (no hidden state applied)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    render(<Reveal><p>content</p></Reveal>);
    expect(screen.getByText("content").closest(".mv-reveal")!.className).not.toMatch(/hidden|in\b/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/marketing/reveal.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/reveal.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Phase = "rest" | "hidden" | "in";

/** Shared scroll-reveal wrapper (spec §8). Server/first paint = visible ("rest").
 *  Only after mount, and only when motion is allowed + IO exists, does it hide
 *  then reveal on intersection. No matchMedia/IO during render (hydration parity). */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("rest");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") return; // stay visible
    setPhase("hidden");
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setPhase("in");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("mv-reveal", phase !== "rest" && phase, className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/marketing/reveal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/reveal.tsx tests/components/marketing/reveal.test.tsx
git commit -m "feat(landing): reveal in-view wrapper (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12 (C): Verdict panel (client island)

Native-radio profile toggle + controlled `.dim`/`.open` dimension rows (a `<button className="dim-head">` toggle, an **always-rendered** `.bar`/`.fill` sibling outside the collapsible region, and a `.dim-detail` — the reference structure, **not** native `<details>`; a closed `<details>` UA-hides every non-`<summary>` child, which would hide the at-rest fill and break invariant 1). Rest = Aarav, dimension rows collapsed, final fill widths inline, final cost (no count-up). Enhancement: on a profile swap, a 150ms fade + CSS width transition + rAF cost count-up. Honesty: "Sample profile" label present; cost line carries **no** "verified" citation; "See full breakdown" → `/assess`.

**Files:**
- Create: `components/marketing/verdict-panel.tsx`
- Test: `tests/components/marketing/verdict-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/verdict-panel.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { VerdictPanel } from "@/components/marketing/verdict-panel";

function reduceMotion() {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
}

describe("VerdictPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("SSR rest state (no effects): Possible, four dims, final cost, Sample label, no 'verified'", () => {
    const html = renderToStaticMarkup(<VerdictPanel />);
    expect(html).toContain("Possible");
    for (const d of ["Academic", "English", "Finances", "Visa risk"]) expect(html).toContain(d);
    expect(html).toContain("≈ A$42,600");
    expect(html).toContain("Sample profile");
    expect(html).not.toMatch(/verified/i); // cost is a sample estimate, never a sourced claim
    expect(html).toMatch(/width:82%/);     // fill set inline, not 0
  });

  it("each fill bar is a DIRECT child of .dim (sibling of .dim-head, outside the collapsible detail) so it shows at rest", () => {
    // jsdom does not apply the native <details> content-hiding UA rule, so we cannot
    // assert visibility directly. Instead assert the STRUCTURE that guarantees it:
    // the .bar must be a direct child of .dim and never nested inside .dim-detail /
    // .dim-head, and there must be no <details>/<summary> that could UA-hide it.
    const { container } = render(<VerdictPanel />);
    const dims = container.querySelectorAll(".dim");
    expect(dims).toHaveLength(4);
    for (const dim of Array.from(dims)) {
      expect(dim.querySelector(":scope > .bar")).not.toBeNull();   // bar is a DIRECT child of .dim
      expect(dim.querySelector(":scope > .bar > .fill")).not.toBeNull();
      expect(dim.querySelector(".dim-detail .bar")).toBeNull();    // never inside the collapsible region
      expect(dim.querySelector(".dim-head .bar")).toBeNull();      // never inside the toggle button
      expect(dim.querySelector("details, summary")).toBeNull();    // no native <details> to UA-hide it
    }
  });

  it("dimension rows expand via the .open class (aria-expanded flips), not native <details>", () => {
    render(<VerdictPanel />);
    const head = screen.getByRole("button", { name: /Academic/i });
    expect(head).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    expect(head.closest(".dim")).toHaveClass("open");
  });

  it("the 'See full breakdown' affordance is a real link to /assess", () => {
    render(<VerdictPanel />);
    expect(screen.getByRole("link", { name: /See full breakdown/i })).toHaveAttribute("href", "/assess");
  });

  it("exposes a native radio group; toggling to Shruti yields Strong (reduced motion)", () => {
    reduceMotion();
    render(<VerdictPanel />);
    const shruti = screen.getByRole("radio", { name: /Shruti · GPA 3.8/i });
    fireEvent.click(shruti);
    const verdict = screen.getByRole("status");
    expect(within(verdict).getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("≈ A$44,200")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/marketing/verdict-panel.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/verdict-panel.tsx
"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SAMPLE_PROFILES, getProfile, formatCost, type SampleProfile } from "@/lib/marketing/sample-profiles";

const DEFAULT_ID: SampleProfile["id"] = "aarav";

export function VerdictPanel() {
  const [activeId, setActiveId] = useState<SampleProfile["id"]>(DEFAULT_ID);
  const [displayCost, setDisplayCost] = useState<number>(getProfile(DEFAULT_ID).cost);
  const [swapping, setSwapping] = useState(false);
  const [openDims, setOpenDims] = useState<Set<string>>(() => new Set());
  const reduceRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const profile = getProfile(activeId);

  function toggleDim(key: string) {
    setOpenDims((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  function countTo(target: number, from: number) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (reduceRef.current) { setDisplayCost(target); return; }
    const dur = 650;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (t0 === null) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplayCost(Math.round(from + (target - from) * e));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  function select(id: SampleProfile["id"]) {
    if (id === activeId) return;
    const next = getProfile(id);
    const from = displayCost;
    if (reduceRef.current) { setActiveId(id); setDisplayCost(next.cost); return; }
    setSwapping(true);
    window.setTimeout(() => {
      setActiveId(id);
      setSwapping(false);
      countTo(next.cost, from);
    }, 150);
  }

  return (
    <div className="panel">
      <div className={cn("panel-head", swapping && "swapping")}>
        <div>
          <div className="p-label">Your assessment</div>
          <div className={cn("verdict", `v-${profile.tone}`)} role="status" aria-live="polite">
            <span className="vd" />
            <span>{profile.verdict}</span>
          </div>
          <p className="p-note">{profile.note}</p>
        </div>
        <div className="head-right">
          <span className="p-badge">Nepal → Australia</span>
          <span className="toggle-lbl">Sample profile</span>
          <div className="toggle" role="radiogroup" aria-label="Sample profile">
            {SAMPLE_PROFILES.map((p) => (
              <label key={p.id} className={cn("toggle-opt", activeId === p.id && "on")}>
                <input
                  type="radio"
                  name="mv-profile"
                  className="vh"
                  checked={activeId === p.id}
                  onChange={() => select(p.id)}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-body">
        <div className="dims">
          {profile.dims.map((d) => {
            const open = openDims.has(d.key);
            return (
              <div className={cn("dim", open && "open")} key={d.key}>
                <button
                  type="button"
                  className="dim-head"
                  aria-expanded={open}
                  onClick={() => toggleDim(d.key)}
                >
                  <span className="dim-name">{d.name}</span>
                  <span className={cn("tag", `t-${d.tone}`)}>{d.tag}</span>
                  <span className="chev" aria-hidden>›</span>
                </button>
                {/* .bar/.fill are a DIRECT sibling of .dim-head — never nested in the
                    collapsible .dim-detail — so the final-width fill shows at rest (invariant 1). */}
                <span className="bar"><span className={cn("fill", `f-${d.tone}`)} style={{ width: `${d.width}%` }} /></span>
                <div className="dim-detail"><div className="dim-detail-inner"><p>{d.blurb}</p></div></div>
              </div>
            );
          })}
        </div>

        <div className="p-side">
          <div className="cost-lbl">Est. first-year cost</div>
          <div className="cost-val">{formatCost(displayCost)}</div>
          <Link className="p-more" href="/assess">See full breakdown →</Link>
          <p className="hint">A sample estimate, not a sourced figure · tap a row for detail, switch the sample profile above.</p>
        </div>
      </div>
    </div>
  );
}
```

Notes: the dimension rows follow the **reference structure** (reference lines 486–521) — each is a controlled `<div className="dim">` holding a `<button className="dim-head" aria-expanded>`, an **always-rendered** `<span className="bar">…fill…</span>` sibling, and the collapsible `<div className="dim-detail">`. The `.bar`/`.fill` are a direct child of `.dim` (a sibling of `.dim-head`, outside `.dim-detail`), so the final-width fill is painted at rest and is **never** gated by the accordion — this is what enforces invariant 1. Do **not** wrap the row in a native `<details>` with the bar as a non-`<summary>` child: a closed `<details>` UA-hides every non-`<summary>` descendant, which would hide all four fills at rest (and jsdom would not catch it because it does not apply that UA rule). Expansion is JS-driven via the `.open` class (`toggleDim`) — this island is already `"use client"`, so that is free; the CSS pairs it as `.dim.open > .dim-detail{grid-template-rows:1fr}` / `.dim.open .chev{transform:rotate(90deg)}` (Task 1). The cost line has no `.p-src`/"verified" text — honesty invariant 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/marketing/verdict-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/verdict-panel.tsx tests/components/marketing/verdict-panel.test.tsx
git commit -m "feat(landing): live verdict panel island (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13 (C): Plan steps accordion (server component)

Native `<details name="mv-plan">` — exclusive-accordion single-open with zero JS. Step 02 carries `open`.

**Files:**
- Create: `components/marketing/plan-steps.tsx`
- Test: `tests/components/marketing/plan-steps.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/plan-steps.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanSteps } from "@/components/marketing/plan-steps";

describe("PlanSteps", () => {
  it("SSR shows all five titles and step 02's detail open with its citation", () => {
    const html = renderToStaticMarkup(<PlanSteps />);
    for (const t of [
      "Confirm your eligibility",
      "Shortlist programs that fit",
      "Sit IELTS or PTE",
      "Prepare financial evidence",
      "Lodge your student visa",
    ]) expect(html).toContain(t);
    // exactly one <details ... open> and it is step 02
    const openCount = (html.match(/<details[^>]*\sopen/g) ?? []).length;
    expect(openCount).toBe(1);
    expect(html).toContain("Source: University data · Jun 2026");
    expect(html).toMatch(/name="mv-plan"/); // native exclusive accordion
  });

  it("renders a source citation for every sourced step", () => {
    const html = renderToStaticMarkup(<PlanSteps />);
    expect(html).toContain("Source: Home Affairs · Jun 2026");
    expect(html).toContain("Source: Home Affairs s.500 · Jun 2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/marketing/plan-steps.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/plan-steps.tsx
import { cn } from "@/lib/utils";
import { PLAN_STEPS } from "@/lib/marketing/plan-steps";

/** Plan-step accordion (spec §4.5). Native <details name="mv-plan"> gives a
 *  single-open accordion with zero JS; step 02 is open at rest. Server component. */
export function PlanSteps() {
  return (
    <div className="surface steps">
      {PLAN_STEPS.map((s) => (
        <details
          key={s.n}
          name="mv-plan"
          open={s.open}
          className={cn("step", s.state === "Done" && "done", s.state === "Now" && "now")}
        >
          <summary className="step-head">
            <span className="step-n">{s.n}</span>
            <span className="step-t">{s.title}</span>
            <span className="step-pill">{s.state}</span>
            <span className="chev" aria-hidden>›</span>
          </summary>
          <div className="step-detail"><div className="step-detail-inner">
            <p>{s.detail} <span className="cite">{s.cite}</span></p>
          </div></div>
        </details>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/marketing/plan-steps.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/plan-steps.tsx tests/components/marketing/plan-steps.test.tsx
git commit -m "feat(landing): native plan-step accordion (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14 (C): Documents checklist (client island)

Native `<input type="checkbox">` rows (2 checked at rest); live "N of 6" count in an `aria-live` region; progress fill width inline at 2/6.

**Files:**
- Create: `components/marketing/documents-checklist.tsx`
- Test: `tests/components/marketing/documents-checklist.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/documents-checklist.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentsChecklist } from "@/components/marketing/documents-checklist";

describe("DocumentsChecklist", () => {
  it("SSR rest: six labels, two checkboxes checked, '2 of 6', fill width 33% inline", () => {
    const html = renderToStaticMarkup(<DocumentsChecklist />);
    expect(html).toContain("Academic transcript verified");
    expect(html).toContain("Genuine Student (GS) statement drafted");
    expect(html).toContain("OSHC health cover arranged");
    expect((html.match(/checked=""|checked/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("of 6 ready");
    expect(html).toMatch(/width:33%/);
  });

  it("rows are role=checkbox; two checked at rest; toggling a third reads '3 of 6'", () => {
    render(<DocumentsChecklist />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(6);
    expect(boxes.filter((b) => (b as HTMLInputElement).checked)).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: /Financial evidence: A\$29,710/i }));
    expect(screen.getByText(/3/).closest(".cl-count")).toHaveTextContent("3 of 6 ready");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/marketing/documents-checklist.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/documents-checklist.tsx
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CHECKLIST_ITEMS } from "@/lib/marketing/checklist-items";

export function DocumentsChecklist() {
  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST_ITEMS.map((i) => i.done));
  const total = CHECKLIST_ITEMS.length;
  const doneCount = checked.filter(Boolean).length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  return (
    <div className={cn("surface checklist", allDone && "alldone")}>
      <div className="cl-top">
        <div className="cl-count" aria-live="polite"><b>{doneCount}</b> of {total} ready</div>
        <span className="ready-pill">All set →</span>
      </div>
      <div className="cl-bar"><span className="cl-fill" style={{ width: `${pct}%` }} /></div>
      {CHECKLIST_ITEMS.map((item, i) => (
        <label key={item.label} className={cn("ck-row", checked[i] && "done")}>
          <input
            type="checkbox"
            className="vh"
            checked={checked[i]}
            onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
          />
          <span className="ck-box" aria-hidden />
          <span className="ck-label">{item.label}</span>
          <span className="ck-src">{item.source}</span>
        </label>
      ))}
    </div>
  );
}
```

The visible `.ck-box` reflects checked state via CSS (`.ck-row.done .ck-box`); the native input is the accessible control (label text names it). `pct = round(2/6*100) = 33`, identical server + client (hydration parity).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/marketing/documents-checklist.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/documents-checklist.tsx tests/components/marketing/documents-checklist.test.tsx
git commit -m "feat(landing): documents checklist island (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15 (C): Guide thread (client island)

Native-radio chips + typewriter autoplay. Rest = `ielts` exchange fully rendered (q + a + citation). Thread is `aria-live="off"`; a separate visually-hidden `aria-live="polite"` region announces completed exchanges. A chip click stops autoplay and (under reduced motion) swaps instantly.

**Files:**
- Create: `components/marketing/guide-thread.tsx`
- Test: `tests/components/marketing/guide-thread.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/guide-thread.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuideThread } from "@/components/marketing/guide-thread";

describe("GuideThread", () => {
  afterEach(() => vi.restoreAllMocks());

  it("SSR rest: the ielts exchange is fully rendered with its citation; thread is aria-live=off", () => {
    const html = renderToStaticMarkup(<GuideThread />);
    expect(html).toContain("I got 6.5 overall. Is that actually enough?");
    expect(html).toContain("already meets the bar");
    expect(html).toContain("Source: Home Affairs · Jun 2026");
    expect(html).toMatch(/aria-live="off"/);
  });

  it("renders three chips as radios; clicking 'funds' swaps to that answer (reduced motion)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    render(<GuideThread />);
    const chips = screen.getAllByRole("radio");
    expect(chips).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: /Does the money have to be mine\?/i }));
    expect(screen.getByText(/Does the bank balance have to be my own money\?/i)).toBeInTheDocument();
    expect(screen.getByText(/genuinely yours and available/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/marketing/guide-thread.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/guide-thread.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GUIDE_ANSWERS, GUIDE_ORDER } from "@/lib/marketing/guide-answers";
import type { GuideKey } from "@/lib/marketing/provenance";

const REST: GuideKey = "ielts";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function punct(ch: string, next: string): number {
  if (ch === "," || ch === ";" || ch === ":") return 140;
  if ((ch === "." || ch === "?" || ch === "!") && (next === "" || next === " ")) return 220;
  return 0;
}

export function GuideThread() {
  const [activeKey, setActiveKey] = useState<GuideKey>(REST);
  const [display, setDisplay] = useState<{ q: string; a: string; cite: boolean }>(() => {
    const it = GUIDE_ANSWERS[REST];
    return { q: it.q, a: it.a, cite: true };
  });
  const [status, setStatus] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);
  const interacted = useRef(false);
  const reduce = useRef(false);

  function showFinal(key: GuideKey) {
    const it = GUIDE_ANSWERS[key];
    setDisplay({ q: it.q, a: it.a, cite: true });
    setStatus(`${it.q} ${it.a} Source: ${it.source} · ${it.verified}`);
  }

  async function play(key: GuideKey): Promise<number> {
    const my = ++runId.current;
    const it = GUIDE_ANSWERS[key];
    setActiveKey(key);
    if (reduce.current) { showFinal(key); return my; }
    setDisplay({ q: "", a: "", cite: false });
    const type = async (field: "q" | "a", text: string, base: number) => {
      for (let i = 1; i <= text.length; i++) {
        if (my !== runId.current) return false;
        setDisplay((d) => ({ ...d, [field]: text.slice(0, i) }));
        await wait(base + punct(text[i - 1], text[i] ?? ""));
      }
      return true;
    };
    if (!(await type("q", it.q, 26))) return my;
    await wait(520); if (my !== runId.current) return my;
    if (!(await type("a", it.a, 15))) return my;
    await wait(220); if (my !== runId.current) return my;
    setDisplay((d) => ({ ...d, cite: true }));
    setStatus(`${it.q} ${it.a} Source: ${it.source} · ${it.verified}`);
    return my;
  }

  function onChip(key: GuideKey) {
    interacted.current = true; // stop autoplay for good
    runId.current++;           // interrupt any in-flight run
    if (reduce.current) { setActiveKey(key); showFinal(key); } else void play(key);
  }

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current || typeof IntersectionObserver === "undefined") return; // rest stays on ielts
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (e) => {
          if (!e.isIntersecting || interacted.current) return;
          interacted.current = true;
          obs.disconnect();
          for (const key of GUIDE_ORDER) {
            const id = await play(key);
            if (id !== runId.current) return; // chip click interrupted
            await wait(1500);
            if (id !== runId.current) return;
          }
        });
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="surface guide-panel" ref={rootRef}>
      <div className="g-chips" role="radiogroup" aria-label="Example questions">
        {GUIDE_ORDER.map((key) => (
          <label key={key} className={cn("g-chip", activeKey === key && "on")}>
            <input
              type="radio"
              name="mv-guide"
              className="vh"
              checked={activeKey === key}
              onChange={() => onChip(key)}
            />
            <span>{GUIDE_ANSWERS[key].chip}</span>
          </label>
        ))}
      </div>
      <div className="g-thread" aria-live="off">
        {display.q && <div className="g-q">{display.q}</div>}
        {display.a && (
          <div className="g-a">
            {display.a}
            <span className={cn("cite", display.cite && "in")}>
              Source: {GUIDE_ANSWERS[activeKey].source} · {GUIDE_ANSWERS[activeKey].verified}
            </span>
          </div>
        )}
      </div>
      <span className="vh" aria-live="polite" aria-atomic="true">{status}</span>
    </div>
  );
}
```

Under the test IO stub (never fires), autoplay never starts, so `render()` leaves the `ielts` rest state intact. `renderToStaticMarkup` produces the same rest DOM without any effect. Reduced-motion chip clicks are synchronous.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/marketing/guide-thread.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/guide-thread.tsx tests/components/marketing/guide-thread.test.tsx
git commit -m "feat(landing): guide typewriter thread island (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16 (C): Freshness table (client island)

Native `<details>` rows. **Provenance is visible at rest** — value, source, verified, and next-check all render in the always-visible summary (never gated behind the accordion, invariant 3 / spec §4.8 critical). Verified dots present at rest. Enhancement: a one-time staggered `.lit` verify-sweep on first in-view.

**Files:**
- Create: `components/marketing/freshness-table.tsx`
- Test: `tests/components/marketing/freshness-table.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/freshness-table.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FreshnessTable } from "@/components/marketing/freshness-table";

describe("FreshnessTable", () => {
  it("SSR (no effects): all five rows expose value, source, verified, and next-check at rest", () => {
    const html = renderToStaticMarkup(<FreshnessTable />);
    // value + provenance visible without interaction
    expect(html).toContain("A$29,710");
    expect(html).toContain("s.500 criteria");
    expect(html).toContain("≈ A$33,000");
    expect(html).toContain("2–4 years");
    expect(html).toContain("required");
    expect((html.match(/verified Jun 2026/g) ?? []).length).toBe(5);
    expect((html.match(/next check Jul 2026/g) ?? []).length).toBe(5);
    expect((html.match(/frow verified/g) ?? []).length).toBe(5); // dots lit at rest
  });

  it("never renders user-facing GTE", () => {
    expect(renderToStaticMarkup(<FreshnessTable />)).not.toMatch(/GTE/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/marketing/freshness-table.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/freshness-table.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";

export function FreshnessTable() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<number[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;
    let swept = false;
    const timers: number[] = [];
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || swept) return;
          swept = true;
          obs.disconnect();
          FRESHNESS_ROWS.forEach((_, i) => {
            timers.push(window.setTimeout(() => {
              setLit((l) => [...l, i]);
              timers.push(window.setTimeout(() => setLit((l) => l.filter((x) => x !== i)), 520));
            }, 130 * i));
          });
        });
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => { obs.disconnect(); timers.forEach(clearTimeout); };
  }, []);

  return (
    <div className="ftable" ref={ref}>
      {FRESHNESS_ROWS.map((row, i) => (
        <details className="fitem" key={row.key}>
          <summary className={cn("frow", "verified", lit.includes(i) && "lit")}>
            <span className="fk">{row.key}</span>
            <span className="fv">{row.value}</span>
            <span className="fd">
              <span className="vdot" />
              {row.source} · verified {row.verified} · next check {row.nextCheck}
            </span>
            <span className="fchev" aria-hidden>›</span>
          </summary>
          <div className="fdetail"><div className="fdetail-inner">
            <p>{row.detail}<span className="fmeta">Verified {row.verified} · Next check {row.nextCheck}</span></p>
          </div></div>
        </details>
      ))}
    </div>
  );
}
```

Rows carry the `verified` class **at rest** (server-rendered), so dots and the full provenance string are present with no JS. The sweep only adds/removes the transient `lit` highlight.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/marketing/freshness-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/freshness-table.tsx tests/components/marketing/freshness-table.test.tsx
git commit -m "feat(landing): freshness table island, provenance at rest (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 17 (C): Sparkle CTA (client island)

A real `<Link href="/assess">` styled as the sparkle button. Particles are seeded with random drift vars **post-mount only** (no `Math.random` during render). `.live` edge-shimmer gate via IO.

**Files:**
- Create: `components/marketing/sparkle-cta.tsx`
- Test: `tests/components/marketing/sparkle-cta.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/sparkle-cta.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { SparkleCta } from "@/components/marketing/sparkle-cta";

describe("SparkleCta", () => {
  it("SSR: a real /assess link with the label; NO particles and NO Math.random during render", () => {
    const rnd = vi.spyOn(Math, "random");
    const html = renderToStaticMarkup(<SparkleCta>Check your eligibility</SparkleCta>);
    expect(html).toContain("Check your eligibility");
    expect(html).toMatch(/href="\/assess"/);
    expect(html).not.toContain('class="particle"'); // particles are seeded post-mount only
    expect(rnd).not.toHaveBeenCalled();
    rnd.mockRestore();
  });

  it("renders as an accessible link", () => {
    render(<SparkleCta>Check your eligibility</SparkleCta>);
    expect(screen.getByRole("link", { name: /Check your eligibility/i })).toHaveAttribute("href", "/assess");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/marketing/sparkle-cta.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/sparkle-cta.tsx
"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const PARTICLE_COUNT = 14;
const PARTICLE_PATH =
  "M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z";

export function SparkleCta({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState(false);
  const [styles, setStyles] = useState<CSSProperties[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
    const sign = () => (Math.random() > 0.5 ? -1 : 1);
    setStyles(
      Array.from({ length: PARTICLE_COUNT }, () => ({
        "--x": rnd(20, 80),
        "--y": rnd(20, 80),
        "--duration": rnd(6, 20),
        "--delay": rnd(1, 10),
        "--alpha": rnd(40, 90) / 100,
        "--size": rnd(40, 90) / 100,
        "--origin-x": `${sign() * rnd(300, 800)}%`,
        "--origin-y": `${sign() * rnd(300, 800)}%`,
      }) as CSSProperties),
    );
    if (reduce || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => setLive(e.isIntersecting)),
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <span className={cn("sparkle-cta", live && "live")} ref={ref}>
      <Link href="/assess" className="s-btn">
        <span className="spark" />
        <span className="backdrop" />
        <svg className="sparkle" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M14.187 8.096L15 5.25L15.813 8.096C16.0231 8.83114 16.4171 9.50062 16.9577 10.0413C17.4984 10.5819 18.1679 10.9759 18.903 11.186L21.75 12L18.904 12.813C18.1689 13.0231 17.4994 13.4171 16.9587 13.9577C16.4181 14.4984 16.0241 15.1679 15.814 15.903L15 18.75L14.187 15.904C13.9769 15.1689 13.5829 14.4994 13.0423 13.9587C12.5016 13.4181 11.8321 13.0241 11.097 12.814L8.25 12L11.096 11.187C11.8311 10.9769 12.5006 10.5829 13.0413 10.0423C13.5819 9.50162 13.9759 8.83214 14.186 8.097L14.187 8.096Z" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 14.25L5.741 15.285C5.59267 15.8785 5.28579 16.4206 4.85319 16.8532C4.42059 17.2858 3.87853 17.5927 3.285 17.741L2.25 18L3.285 18.259C3.87853 18.4073 4.42059 18.7142 4.85319 19.1468C5.28579 19.5794 5.59267 20.1215 5.741 20.715L6 21.75L6.259 20.715C6.40725 20.1216 6.71398 19.5796 7.14639 19.147C7.5788 18.7144 8.12065 18.4075 8.714 18.259L9.75 18L8.714 17.741C8.12065 17.5925 7.5788 17.2856 7.14639 16.853C6.71398 16.4204 6.40725 15.8784 6.259 15.285L6 14.25Z" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.5 4L6.303 4.5915C6.24777 4.75718 6.15472 4.90774 6.03123 5.03123C5.90774 5.15472 5.75718 5.24777 5.5915 5.303L5 5.5L5.5915 5.697C5.75718 5.75223 5.90774 5.84528 6.03123 5.96877C6.15472 6.09226 6.24777 6.24282 6.303 6.4085L6.5 7L6.697 6.4085C6.75223 6.24282 6.84528 6.09226 6.96877 5.96877C7.09226 5.84528 7.24282 5.75223 7.4085 5.697L8 5.5L7.4085 5.303C7.24282 5.24777 7.09226 5.15472 6.96877 5.03123C6.84528 4.90774 6.75223 4.75718 6.697 4.5915L6.5 4Z" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text">{children}</span>
      </Link>
      <span aria-hidden className="particle-pen">
        {styles.map((s, i) => (
          <svg key={i} className="particle" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" style={s}>
            <path d={PARTICLE_PATH} fill="currentColor" />
          </svg>
        ))}
      </span>
    </span>
  );
}
```

SSR renders `styles=[]` → empty pen (no `Math.random`), so first client paint matches; the effect then seeds particles and toggles `.live`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/marketing/sparkle-cta.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/sparkle-cta.tsx tests/components/marketing/sparkle-cta.test.tsx
git commit -m "feat(landing): sparkle CTA island, post-mount particles (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18 (D): Rebuild the page shell

Full rebuild of `app/(marketing)/page.tsx` to the v7 body. **Keeps** the `getUser()` → `redirect("/dashboard")` guard. **Drops** `<TrustStrip/>` and the old tile/how-it-works/hero-preview/trust-callout imports. Renders the `.mv-landing` root, the inline `#hero-rough` filter, hero + verdict stage + proof strip, the three product splits (`id="how"` on plan, `id="what"` on documents), the freshness band, and the close with the sparkle CTA. Header/footer come from the layout (see Reconciliation #1).

**Files:**
- Modify: `app/(marketing)/page.tsx` (replace the whole file)
- Test: `tests/app/marketing-home.test.tsx` (replace the whole file)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/marketing-home.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import HomePage from "@/app/(marketing)/page";

describe("Marketing homepage (v7)", () => {
  it("renders the hero H1, sub-line, provenance line, and the three proof claims", async () => {
    render(await HomePage());
    expect(screen.getByText(/An honest answer before you/i)).toBeInTheDocument();
    expect(screen.getByText(/pay anyone\./i)).toBeInTheDocument();
    expect(screen.getByText(/Where do you actually stand academically/i)).toBeInTheDocument();
    expect(screen.getByText(/Built on official Home Affairs and university data/i)).toBeInTheDocument();
    expect(screen.getByText(/Official Home Affairs & university data/i)).toBeInTheDocument();
    expect(screen.getByText(/Every figure sourced and dated/i)).toBeInTheDocument();
    expect(screen.getByText(/Free, no sign-up to start/i)).toBeInTheDocument();
  });

  it("renders each product section heading and the freshness/close copy", async () => {
    render(await HomePage());
    expect(screen.getByText(/The answer becomes a plan\./i)).toBeInTheDocument();
    expect(screen.getByText(/Every requirement, sourced\./i)).toBeInTheDocument();
    expect(screen.getByText(/A guide that remembers you\./i)).toBeInTheDocument();
    expect(screen.getByText(/Every figure shows its source and date\./i)).toBeInTheDocument();
    expect(screen.getByText(/Know, instead of hoping\./i)).toBeInTheDocument();
  });

  it("exposes #how and #what in-page anchor targets", async () => {
    const { container } = render(await HomePage());
    expect(container.querySelector("#how")).not.toBeNull();
    expect(container.querySelector("#what")).not.toBeNull();
  });

  it("has no dead links: no href='#'; both eligibility CTAs + See full breakdown -> /assess", async () => {
    render(await HomePage());
    const links = screen.getAllByRole("link");
    for (const a of links) expect(a.getAttribute("href")).not.toBe("#");
    const assess = links.filter((a) => a.getAttribute("href") === "/assess");
    // hero CTA + 3 section soft links + verdict "See full breakdown" + closing sparkle CTA
    expect(assess.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole("link", { name: /See full breakdown/i })).toHaveAttribute("href", "/assess");
    const heroCta = screen.getByRole("link", { name: /Check your eligibility/i });
    expect(heroCta).toHaveAttribute("href", "/assess");
  });

  it("does not render the removed TrustStrip / tiles copy", async () => {
    render(await HomePage());
    expect(screen.queryByText(/Three quiet tools, no clutter/i)).toBeNull();
    expect(screen.queryByText(/A preview of your feed/i)).toBeNull();
  });

  it("redirects signed-in users to /dashboard before rendering", async () => {
    vi.resetModules();
    const redirectSpy = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
    vi.doMock("next/navigation", () => ({ redirect: redirectSpy }));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      }),
    }));
    const { default: SignedInHome } = await import("@/app/(marketing)/page");
    await expect(SignedInHome()).rejects.toThrow("REDIRECT:/dashboard");
    expect(redirectSpy).toHaveBeenCalledWith("/dashboard");
    vi.doUnmock("next/navigation");
    vi.doUnmock("@/lib/supabase/server");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app/marketing-home.test.tsx`
Expected: FAIL — old page still renders the tiles/hero-preview copy; new headings/anchors absent.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/(marketing)/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HeroMarker } from "@/components/marketing/hero-marker";
import { Reveal } from "@/components/marketing/reveal";
import { VerdictPanel } from "@/components/marketing/verdict-panel";
import { PlanSteps } from "@/components/marketing/plan-steps";
import { DocumentsChecklist } from "@/components/marketing/documents-checklist";
import { GuideThread } from "@/components/marketing/guide-thread";
import { FreshnessTable } from "@/components/marketing/freshness-table";
import { SparkleCta } from "@/components/marketing/sparkle-cta";
import "./landing.css";

export default async function HomePage() {
  // Signed-in users skip the marketing landing — drop them on the dashboard.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mv-landing">
      {/* hidden SVG filter for the hand-drawn hero marker (§4.1) */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
        <filter id="hero-rough" x="-10%" y="-10%" width="120%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {/* HERO */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-top">
            <div className="eyebrow">For students applying abroad</div>
            <h1>An honest answer before you <HeroMarker>pay anyone.</HeroMarker></h1>
            <p className="sub">Where do you actually stand academically, financially, and on visa risk?</p>
            <p className="prov">Built on official Home Affairs and university data. Every figure shows its source and date.</p>
            <div className="cta-row">
              <Link className="cta" href="/assess">Check your eligibility <span className="arw">→</span></Link>
              <span className="meta">9 quick questions · no account needed</span>
            </div>
          </div>

          <div className="stage"><VerdictPanel /></div>

          <div className="proof">
            <div className="pf"><span className="dot" />Official Home Affairs & university data</div>
            <div className="pf"><span className="dot" />Every figure sourced and dated</div>
            <div className="pf"><span className="dot" />Free, no sign-up to start</div>
          </div>
        </div>
      </section>

      {/* PLAN */}
      <section className="psec" id="how">
        <div className="wrap">
          <div className="split">
            <div className="s-copy">
              <div className="section-eyebrow">From verdict to plan</div>
              <h2>The answer becomes a plan.</h2>
              <p className="s-lede">Not a generic to-do list. A sequenced path built from your verdict, one step live at a time.</p>
              <Link className="lnk" href="/assess">See a sample plan <span className="arw">→</span></Link>
            </div>
            <Reveal><PlanSteps /></Reveal>
          </div>
        </div>
      </section>

      {/* DOCUMENTS */}
      <section className="psec" id="what">
        <div className="wrap">
          <div className="split rev">
            <div className="s-copy">
              <div className="section-eyebrow">Documents</div>
              <h2>Every requirement, sourced.</h2>
              <p className="s-lede">Your verdict becomes a per-program checklist. As you tick things off, the readiness bar moves with you.</p>
              <Link className="lnk" href="/assess">See the checklist <span className="arw">→</span></Link>
            </div>
            <Reveal><DocumentsChecklist /></Reveal>
          </div>
        </div>
      </section>

      {/* GUIDE */}
      <section className="psec">
        <div className="wrap">
          <div className="split">
            <div className="s-copy">
              <div className="section-eyebrow">The guide</div>
              <h2>A guide that remembers you.</h2>
              <p className="s-lede">Ask the awkward questions you'd hesitate to ask an agent. Answers are grounded in your own numbers, with the source attached.</p>
              <Link className="lnk" href="/assess">Meet the guide <span className="arw">→</span></Link>
            </div>
            <Reveal><GuideThread /></Reveal>
          </div>
        </div>
      </section>

      {/* FRESHNESS */}
      <section className="fresh">
        <div className="wrap">
          <Reveal className="fh">
            <div className="section-eyebrow" style={{ textAlign: "center" }}>Sourced & dated</div>
            <h2>Every figure shows its source and date.</h2>
            <p className="lede">Here, the numbers a consultancy quotes from memory carry their origin and a verified date you can check.</p>
          </Reveal>
          <Reveal><FreshnessTable /></Reveal>
          <p className="foot">If a figure ages past its check date, we re-verify it before you see it.</p>
        </div>
      </section>

      {/* CLOSE */}
      <section className="close">
        <div className="wrap">
          <Reveal>
            <h2>Know, instead of hoping.</h2>
            <SparkleCta>Check your eligibility</SparkleCta>
            <p className="meta">9 quick questions · no account needed · free</p>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/app/marketing-home.test.tsx`
Expected: PASS (7 cases). Then run `npm run typecheck` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add app/(marketing)/page.tsx tests/app/marketing-home.test.tsx
git commit -m "feat(landing): rebuild page to v7 body, keep redirect guard (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 19 (E): Delete superseded components

The rebuilt page no longer imports `HeroPreview`, `HowItWorks`, `Tile`, `TrustCallout`, or `TrustStrip`. Delete each (and its test) **only after verifying no other importer**. `Eyebrow` stays (used by sibling marketing pages; the new page uses the scoped `.eyebrow` class).

**Files:**
- Delete: `components/marketing/hero-preview.tsx`, `components/marketing/how-it-works.tsx`, `components/marketing/tile.tsx`, `components/marketing/trust-callout.tsx` + their tests
- Delete (conditional): `components/layout/trust-strip.tsx` + its test
- Keep: `components/marketing/eyebrow.tsx`

- [ ] **Step 1: Verify no other importers**

Run each and confirm the **only** hits are the files being deleted (and their own tests):

```bash
git grep -n "hero-preview\|HeroPreview" -- '*.tsx' '*.ts'
git grep -n "how-it-works\|HowItWorks" -- '*.tsx' '*.ts'
git grep -n "components/marketing/tile\|\bTile\b" -- '*.tsx' '*.ts'
git grep -n "trust-callout\|TrustCallout" -- '*.tsx' '*.ts'
git grep -n "trust-strip\|TrustStrip" -- '*.tsx' '*.ts'
git grep -n "components/marketing/eyebrow\|\bEyebrow\b" -- '*.tsx' '*.ts'
```

Expected: the first four have no importer outside their own file + test (the page rebuild in Task 18 already dropped them). `TrustStrip` — if the only remaining importer was the old `page.tsx` (now gone), it is safe to delete; if any other file imports it, **keep it** and only remove it from the page (already done). `Eyebrow` will show sibling-page importers (`app/(marketing)/how`, `destinations`, `trust`) — **do not delete**.

- [ ] **Step 2: Delete the confirmed-orphan files**

```bash
git rm components/marketing/hero-preview.tsx tests/components/marketing/hero-preview.test.tsx
git rm components/marketing/how-it-works.tsx tests/components/marketing/how-it-works.test.tsx
git rm components/marketing/tile.tsx tests/components/marketing/tile.test.tsx
git rm components/marketing/trust-callout.tsx tests/components/marketing/trust-callout.test.tsx
# TrustStrip ONLY if Step 1 proved the landing was its sole importer:
git rm components/layout/trust-strip.tsx tests/components/layout/trust-strip.test.tsx  # (path may differ; skip if kept)
```

- [ ] **Step 3: Run the full suite to prove nothing dangles**

Run: `npm run typecheck && npm test`
Expected: PASS — no unresolved imports, no orphaned test referencing a deleted component.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(landing): remove superseded old-landing components (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 20 (F): Cross-cutting guards + gate

Integration-level guards the per-component tests don't cover: hydration parity (no forbidden calls during render, no hydration warning), reduced-motion behaviour on the composed page, and theme parity in the CSS. Then the green gate.

**Files:**
- Test: `tests/app/landing-guards.test.tsx`
- Test: `tests/styles/landing-theme-parity.test.ts`

- [ ] **Step 1: Write the failing hydration + reduced-motion test**

```tsx
// tests/app/landing-guards.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VerdictPanel } from "@/components/marketing/verdict-panel";
import { GuideThread } from "@/components/marketing/guide-thread";
import { FreshnessTable } from "@/components/marketing/freshness-table";
import { DocumentsChecklist } from "@/components/marketing/documents-checklist";

afterEach(() => vi.restoreAllMocks());

describe("landing hydration parity", () => {
  it("no Math.random / matchMedia / IntersectionObserver during initial render", () => {
    const rnd = vi.spyOn(Math, "random");
    const mm = vi.spyOn(window, "matchMedia");
    const io = vi.spyOn(window, "IntersectionObserver");
    renderToString(<VerdictPanel />);
    renderToString(<GuideThread />);
    renderToString(<FreshnessTable />);
    renderToString(<DocumentsChecklist />);
    expect(rnd).not.toHaveBeenCalled();
    expect(mm).not.toHaveBeenCalled();
    expect(io).not.toHaveBeenCalled();
  });

  it("SSR-then-hydrate each island produces no React hydration mismatch warning (invariant 2)", () => {
    // A REAL hydration test: render the island's server HTML, mount it into a
    // container, then hydrateRoot the SAME component onto that markup. React only
    // emits "did not match" / "server HTML" warnings when the first client paint
    // diverges from the SSR output — which is exactly invariant 2. (A plain client
    // render() never hydrates server HTML, so it can never surface this class of bug;
    // the forbidden-calls test above is the other half of the invariant-2 guard.)
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const islands = [<VerdictPanel />, <GuideThread />, <FreshnessTable />, <DocumentsChecklist />];
    for (const island of islands) {
      const html = renderToString(island);
      const container = document.createElement("div");
      container.innerHTML = html;
      let root: ReturnType<typeof hydrateRoot>;
      act(() => {
        root = hydrateRoot(container, island);
      });
      act(() => {
        root!.unmount();
      });
    }
    const hydrationWarnings = err.mock.calls.filter((c) =>
      String(c[0]).match(/hydrat|did not match|server HTML/i),
    );
    expect(hydrationWarnings).toEqual([]);
  });
});

describe("landing reduced-motion behaviour", () => {
  it("keeps interaction (toggle/checkbox/chip) working while animation is suppressed", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    // verdict toggle still switches to Strong, instantly
    const { unmount } = render(<VerdictPanel />);
    fireEvent.click(screen.getByRole("radio", { name: /Shruti/i }));
    expect(screen.getByText("Strong")).toBeInTheDocument();
    unmount();
    // checklist still toggles
    render(<DocumentsChecklist />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmation of Enrolment/i }));
    expect(screen.getByText(/3 of 6 ready/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `npm test -- tests/app/landing-guards.test.tsx`
Expected: PASS (the islands were built to satisfy these; if the hydration-parity case FAILS, an island is calling a forbidden API during render — move it into `useEffect`).

- [ ] **Step 3: Write the theme-parity CSS test**

```ts
// tests/styles/landing-theme-parity.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readLandingCss(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "..", "..", "app", "(marketing)", "landing.css"), "utf8");
}

describe("landing theme parity", () => {
  const css = readLandingCss();
  it("a stamped data-theme wins over prefers-color-scheme in both directions", () => {
    // both explicit data-theme overrides exist and set --paper to their scheme value
    expect(css).toMatch(/:root\[data-theme="dark"\]\s+\.mv-landing\{[^}]*--paper:\s*#131013/);
    expect(css).toMatch(/:root\[data-theme="light"\]\s+\.mv-landing\{[^}]*--paper:\s*#f4f1ea/);
  });
  it("dark mode uses background-color, never the background shorthand, on the root", () => {
    const root = /\.mv-landing\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? "";
    expect(root).toMatch(/background-color:\s*var\(--paper\)/);
    expect(root).not.toMatch(/\bbackground:\s/);
  });
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- tests/styles/landing-theme-parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate + commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

```bash
git add tests/app/landing-guards.test.tsx tests/styles/landing-theme-parity.test.ts
git commit -m "test(landing): hydration parity, reduced-motion, theme parity guards (MV-112)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Update the kanban + regenerate the board**

Set MV-112's `col` to `review` (or per the ritual) in `docs/kanban/board.json`, record the green gate as evidence on `docs/kanban/cards/MV-112.md`, then:

```bash
npm run board
git add docs/kanban/
git commit -m "docs(kanban): MV-112 → In Review, landing redesign gate green

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (completed during authoring)

**Spec coverage §3–§11:**
- §3 structure (hero → plan → docs → guide → freshness → close) → Task 18; header/footer via layout (Reconciliation #1); `#how`/`#what` ids → Task 18.
- §3a link map (no `href="#"`; CTAs + soft links + See-full-breakdown → `/assess`; Sign in → `/auth` via AppBar) → Tasks 12, 17, 18, 20.
- §3b responsive (860px collapse, nav hide, freshness reflow) → Task 1 CSS `@media (max-width:860px)`.
- §4.1 hero marker → Tasks 1 (CSS + filter), 10, 18. §4.2 sparkle → Tasks 1, 17. §4.3 grain → Task 1.
- §4.4 verdict panel → Task 12. §4.5 plan accordion → Task 13. §4.6 checklist → Task 14. §4.7 guide → Task 15. §4.8 freshness → Task 16.
- §5 tokens (both themes ×3, real fonts) → Task 1. §6 typed data + discriminated union → Tasks 2–7. §7 progressive-enhancement/hydration → Tasks 11–17, 20. §8 decomposition → Tasks 10–18. §9 reconcile below-fold reveal + deletions → Tasks 11, 18, 19. §10 a11y (radios, native details, aria-live, focus ring) → Tasks 1, 12, 14, 15. §11 tests (every bullet) → Tasks 8, 12, 14, 18, 20.

**Locked invariants → covering test:** (1) SSR filled rest → §SSR tests in Tasks 12/13/14/15/16, **plus** Task 12's structural bar-placement test proving each `.fill` is a direct child of `.dim` (sibling of `.dim-head`, outside `.dim-detail`, no native `<details>`) so the fill is never accordion-gated at rest — the guard that jsdom's inability to apply the `<details>` UA-hide rule would otherwise leave a false positive. (2) hydration parity → Task 20 (both halves: the forbidden-calls guard on `renderToString`, **and** a real SSR-then-`hydrateRoot` test that surfaces any first-paint className/text mismatch). (3) honesty split → Tasks 8, 12, 16. (4) GS terminology → Tasks 5, 6, 7, 8. (5) no dead links → Task 18. (6) redirect → Task 18. (7) no em-dash → Task 8. (8) both themes → Tasks 1, 20. (9) three flourishes → Task 1. (10) no-JS vs reduced-motion split → native-details/radio/checkbox (Tasks 13/12/15/14) + reduced-motion test (Task 20). (11) presentational only → no scoring/API/DB/Zod/auth files touched.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `Tone`/`VerdictWord`/`DimTag`/`StepState`/`GuideKey`/`Sourced`/`Sample` defined in Task 2 and imported unchanged by Tasks 3–7; `SampleProfile`/`Dimension`/`formatCost`/`getProfile` (Task 3) consumed by Task 12; `PLAN_STEPS`/`CHECKLIST_ITEMS`/`GUIDE_ANSWERS`+`GUIDE_ORDER`/`FRESHNESS_ROWS` names identical across data + component + guard tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-landing-redesign.md`. Recommended execution: **superpowers:subagent-driven-development** — dispatch a fresh subagent per task (1 → 20), two-stage review between tasks. Tasks 2–17 are largely independent once Task 2 (types) and Task 9 (test stubs) land; Tasks 18–20 are sequential and depend on all components existing.

---

## Reviewer nits to fold during the owning task (from the round-2 adversarial verify)

These five nits are not blockers; the implementer of each owning task MUST address them (the orchestrator injects the relevant one into that task's dispatch):

- **Task 6 + Task 15 (guide citation format):** render the guide citation as the reference's **bare** `Home Affairs · Jun 2026` (no `Source: ` prefix), matching spec §4.7 / reference line 864; update the SSR test's expected string to match. (Plan-step cites keep their own format from their data.)
- **Task 8 + Task 20 (em-dash / honesty guard coverage):** the no-em-dash + no-GTE guard must ALSO read the JSX-embedded copy — `app/(marketing)/page.tsx` and every `components/marketing/*.tsx` hint/lede string (`readFileSync` + assert no `U+2014` and no `GTE`/`Genuine Temporary Entrant`), not just the 5 `lib/marketing/*` data modules. Also ensure no em-dash survives in a `page.tsx` code comment.
- **Task 2 (dead type guards):** either consume `isSourced`/`isSample` at a real render-time discrimination point (a helper that refuses to print a `verified` citation when `kind === 'sample'`) or drop them; do not leave guards that only test themselves.
- **Task 14 ("All set" pill):** add a test that checks all six checklist boxes and asserts the `.checklist` container gains `alldone` / the ready-pill becomes visible / the count reads `6 of 6` — spec §4.6's 6/6 state must be verified.
- **Task 1 (responsive CSS test):** add an assertion that `landing.css` contains `@media (max-width:860px)` and a representative reflow rule (e.g. the panel body collapsing to `grid-template-columns:1fr`), so a dropped §3b breakpoint fails green.

