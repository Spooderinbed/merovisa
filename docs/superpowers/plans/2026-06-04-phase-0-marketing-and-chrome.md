# Phase 0: Marketing surface + chrome — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder homepage with the full Claude Design marketing surface (home, destinations, destination detail, how, trust, auth) and stand up the shared layout chrome (AppBar marketing variant, FocusBar, Footer, TrustStrip, Logo), with no DB changes and the existing wizard → results → OAuth claim flow unchanged.

**Architecture:** Two new Next.js route groups — `(marketing)/` (AppBar marketing variant + Footer) and `(focused)/` (FocusBar) — wrap the existing pages and the new marketing pages. Layout primitives live in `components/layout/`, marketing-only sections in `components/marketing/`, destination sections in `components/destinations/`, auth screen in `components/auth/`. Marketing-only country data lives in a new `lib/marketing/destinations.ts` so the scoring engine's `lib/data/destination/*.ts` is untouched. Server components by default; client only for the auth-card (needs OAuth click + disclosure state).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 with existing CSS tokens (`@theme` in `app/globals.css`), Vitest + @testing-library, Zod.

---

## Background the engineer needs

- **Spec:** `docs/superpowers/specs/2026-06-04-marketing-and-shell-design.md` — §3 (routes), §5.2 (component layout), §6 Phase 0 (acceptance criteria).
- **Reference design (local-only, gitignored):** `claudedesign/home.jsx`, `claudedesign/components.jsx`, `claudedesign/destination.jsx`, `claudedesign/auth.jsx`, `claudedesign/data.js`, `claudedesign/styles.css`. Screenshots at `C:\Users\thapa\AppData\Local\Temp\design-{home,destinations,auth}-desktop.png`.
- **Existing design tokens** are already in `app/globals.css` (`@theme` block). Use the named tokens (`bg`, `surface`, `surface-2`, `ink`, `ink-soft`, `ink-faint`, `line`, `line-2`, `primary`, `primary-ink`, `primary-tint`, `primary-tint-2`, `on-primary`, `strong`, `strong-tint`, `possible`, `possible-tint`, `reach`, `reach-tint`, plus radii `sm/md/lg/pill`, containers `wrap=1120 / narrow=720`, easing `calm`, animations `fade/rise`). Do **not** add new tokens in Phase 0.
- **Existing primitives** in `components/ui/`: `Button` (variant `primary | ghost | quiet`, size `sm | md | lg`), `Segmented`, `Slider`, `ProgressDots`, `InlineCallout`, `OptionCard`. Reuse, don't duplicate.
- **Existing chrome convention:** none yet. Every page in `app/` is wrapped only by the root `app/layout.tsx` (fonts + theme). This plan introduces route-group layouts.
- **Aliases:** `@/*` maps to repo root. **Named exports**, **kebab-case files**, **PascalCase components**.
- **Server components by default.** Add `"use client"` only when the component holds state or attaches event handlers.
- **Run a single test:** `npm test -- <path>`. **Full gate:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- **Existing OAuth flow:** `/auth/callback` (`app/auth/callback/route.ts`) accepts `?code=` and optional `?claim=`. When `claim` is missing, redirects to `/`. Phase 0 `/auth` page uses this same callback without a claim id.

---

## File Structure

```
app/
├── (marketing)/                        NEW route group
│   ├── layout.tsx                       NEW — wraps AppBar (marketing) + Footer
│   ├── page.tsx                         NEW — homepage (replaces app/page.tsx)
│   ├── destinations/page.tsx            NEW — 6-card grid
│   ├── destinations/[id]/page.tsx       NEW — country detail
│   ├── how/page.tsx                     NEW — stub
│   ├── trust/page.tsx                   NEW — stub
│   └── auth/page.tsx                    NEW — Google OAuth + collapsed email disclosure
│
├── (focused)/                          NEW route group
│   ├── layout.tsx                       NEW — wraps FocusBar
│   ├── assess/page.tsx                  MOVED from app/assess/page.tsx
│   └── assessment/[id]/page.tsx         MOVED from app/assessment/[id]/page.tsx
│
├── page.tsx                            DELETED (moved to (marketing)/page.tsx)
├── assess/page.tsx                     DELETED (moved to (focused)/assess/page.tsx)
├── assessment/[id]/page.tsx            DELETED (moved to (focused)/assessment/[id]/page.tsx)
└── (root layout, api/, auth/, globals.css) UNCHANGED

components/
├── layout/                             NEW
│   ├── logo.tsx
│   ├── trust-strip.tsx
│   ├── footer.tsx
│   ├── focus-bar.tsx
│   └── app-bar.tsx                      marketing variant only in Phase 0
├── marketing/                          NEW
│   ├── eyebrow.tsx
│   ├── tile.tsx
│   ├── hero-preview.tsx
│   ├── how-it-works.tsx
│   └── trust-callout.tsx
├── destinations/                       NEW
│   ├── destination-card.tsx
│   ├── destination-detail.tsx
│   └── fact.tsx
└── auth/                               NEW
    └── auth-card.tsx                    client component (OAuth click + disclosure)

lib/
└── marketing/                          NEW
    └── destinations.ts                  marketing-only country data (6 entries)

tests/
├── components/layout/{logo, trust-strip, footer, focus-bar, app-bar}.test.tsx        NEW
├── components/marketing/{eyebrow, tile, hero-preview, how-it-works, trust-callout}.test.tsx   NEW
├── components/destinations/{destination-card, destination-detail, fact}.test.tsx     NEW
├── components/auth/auth-card.test.tsx                                                NEW
├── marketing/destinations.test.ts                                                    NEW
├── app/marketing-home.test.tsx                                                       NEW
├── app/destinations-index.test.tsx                                                   NEW
├── app/destination-detail.test.tsx                                                   NEW
├── app/auth-page.test.tsx                                                            NEW
└── app/assessment-page.test.tsx                                                      MODIFIED — import path
```

---

## Task 1: Logo primitive

**Files:**
- Create: `components/layout/logo.tsx`
- Create: `tests/components/layout/logo.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/layout/logo.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "@/components/layout/logo";

describe("Logo", () => {
  it("renders the wordmark and a graduation-cap mark, linking to / by default", () => {
    render(<Logo />);
    const link = screen.getByRole("link", { name: /MyVisa/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("accepts a custom href", () => {
    render(<Logo href="/dashboard" />);
    expect(screen.getByRole("link", { name: /MyVisa/i })).toHaveAttribute("href", "/dashboard");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/layout/logo.test.tsx`
Expected: FAIL — `@/components/layout/logo` unresolved.

- [ ] **Step 3: Implement**

```tsx
// components/layout/logo.tsx
import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-md bg-primary text-on-primary"
      >
        {/* graduation cap */}
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10 12 5 2 10l10 5 10-5Z" />
          <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
        </svg>
      </span>
      <span className="text-[18px] font-medium tracking-[-0.02em] text-ink">MyVisa</span>
    </Link>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/layout/logo.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/layout/logo.tsx tests/components/layout/logo.test.tsx
git commit -m "feat: add Logo primitive for layout chrome"
```

---

## Task 2: TrustStrip

**Files:**
- Create: `components/layout/trust-strip.tsx`
- Create: `tests/components/layout/trust-strip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/layout/trust-strip.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrustStrip } from "@/components/layout/trust-strip";

describe("TrustStrip", () => {
  it("renders the canonical trust line", () => {
    render(<TrustStrip />);
    expect(
      screen.getByText(/No agents · no hidden commissions · we never steer you toward whoever pays us/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/layout/trust-strip.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```tsx
// components/layout/trust-strip.tsx
export function TrustStrip() {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex h-[38px] w-full max-w-[1120px] items-center justify-center gap-2 px-5">
        <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
        <span className="font-mono text-[12.5px] text-ink-soft">
          No agents · no hidden commissions · we never steer you toward whoever pays us
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/layout/trust-strip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/layout/trust-strip.tsx tests/components/layout/trust-strip.test.tsx
git commit -m "feat: add TrustStrip layout component"
```

---

## Task 3: Footer

**Files:**
- Create: `components/layout/footer.tsx`
- Create: `tests/components/layout/footer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/layout/footer.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/layout/footer";

describe("Footer", () => {
  it("renders the three column titles and the trust + copyright lines", () => {
    render(<Footer />);
    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(screen.getByText(/Trust/i)).toBeInTheDocument();
    expect(screen.getByText(/Company/i)).toBeInTheDocument();
    expect(screen.getByText(/Visa rules sourced from official government sites/i)).toBeInTheDocument();
    expect(screen.getByText(/© 2026 MyVisa/i)).toBeInTheDocument();
  });

  it("renders linkable footer entries", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: /Eligibility/i })).toHaveAttribute("href", "/assess");
    expect(screen.getByRole("link", { name: /Destinations/i })).toHaveAttribute("href", "/destinations");
    expect(screen.getByRole("link", { name: /How we score/i })).toHaveAttribute("href", "/how");
    expect(screen.getByRole("link", { name: /Why no agents/i })).toHaveAttribute("href", "/trust");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/layout/footer.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```tsx
// components/layout/footer.tsx
import Link from "next/link";
import { Logo } from "./logo";

type Col = { title: string; links: Array<{ label: string; href: string }> };

const COLS: Col[] = [
  {
    title: "Product",
    links: [
      { label: "Eligibility", href: "/assess" },
      { label: "Destinations", href: "/destinations" },
      { label: "AI guide", href: "/how#guide" },
      { label: "SOP coach", href: "/how#sop" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "How we score", href: "/how" },
      { label: "Our data sources", href: "/trust#sources" },
      { label: "Why no agents", href: "/trust" },
      { label: "Privacy", href: "/trust#privacy" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/trust#about" },
      { label: "Contact", href: "/trust#contact" },
      { label: "Careers", href: "/trust#careers" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1120px] px-7 pb-12 pt-10">
        <div className="flex flex-wrap justify-between gap-6">
          <div className="flex max-w-[340px] flex-col gap-3">
            <Logo />
            <p className="text-[15px] text-ink-soft">
              An honest reality check before you pay anyone. No agents, no hidden commissions.
            </p>
          </div>
          <div className="flex flex-wrap gap-10">
            {COLS.map((c) => (
              <div key={c.title} className="flex flex-col gap-2">
                <span className="mb-1 font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
                  {c.title}
                </span>
                {c.links.map((l) => (
                  <Link key={l.label} href={l.href} className="text-[15px] text-ink-soft hover:text-ink">
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <hr className="my-6 border-line" />
        <div className="flex flex-wrap justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-mono text-[12.5px] text-ink-soft">
            <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            </svg>
            Visa rules sourced from official government sites · checked daily
          </span>
          <span className="font-mono text-[12.5px] text-ink-soft">© 2026 MyVisa</span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/layout/footer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/layout/footer.tsx tests/components/layout/footer.test.tsx
git commit -m "feat: add Footer layout component"
```

---

## Task 4: FocusBar

**Files:**
- Create: `components/layout/focus-bar.tsx`
- Create: `tests/components/layout/focus-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/layout/focus-bar.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FocusBar } from "@/components/layout/focus-bar";

describe("FocusBar", () => {
  it("renders the logo and the no-sign-up reassurance note", () => {
    render(<FocusBar />);
    expect(screen.getByRole("link", { name: /MyVisa/i })).toHaveAttribute("href", "/");
    expect(screen.getByText(/no sign-up to start/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/layout/focus-bar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/layout/focus-bar.tsx
import { Logo } from "./logo";

export function FocusBar() {
  return (
    <header className="border-b border-line bg-bg">
      <div className="mx-auto flex h-[60px] w-full max-w-[1120px] items-center justify-between px-5">
        <Logo />
        <span className="hidden items-center gap-2 font-mono text-[12.5px] text-ink-soft sm:inline-flex">
          <svg aria-hidden viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          </svg>
          no sign-up to start
        </span>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/layout/focus-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/layout/focus-bar.tsx tests/components/layout/focus-bar.test.tsx
git commit -m "feat: add FocusBar for the (focused) route group"
```

---

## Task 5: AppBar (marketing variant)

**Files:**
- Create: `components/layout/app-bar.tsx`
- Create: `tests/components/layout/app-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/layout/app-bar.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppBar } from "@/components/layout/app-bar";

describe("AppBar — marketing variant", () => {
  it("renders the public nav, sign-in, and check-eligibility CTA", () => {
    render(<AppBar variant="marketing" />);
    expect(screen.getByRole("link", { name: /MyVisa/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /How it works/i })).toHaveAttribute("href", "/how");
    expect(screen.getByRole("link", { name: /Destinations/i })).toHaveAttribute("href", "/destinations");
    expect(screen.getByRole("link", { name: /Why trust us/i })).toHaveAttribute("href", "/trust");
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute("href", "/auth");
    expect(screen.getByRole("link", { name: /Check eligibility/i })).toHaveAttribute("href", "/assess");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/layout/app-bar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/layout/app-bar.tsx
import Link from "next/link";
import { Logo } from "./logo";

type Variant = "marketing";   // "app" variant added in Phase 1

const NAV_MARKETING = [
  { label: "How it works", href: "/how" },
  { label: "Destinations", href: "/destinations" },
  { label: "Why trust us", href: "/trust" },
];

export function AppBar({ variant }: { variant: Variant }) {
  if (variant === "marketing") {
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {NAV_MARKETING.map((i) => (
                <Link key={i.href} href={i.href} className="text-[15px] text-ink-soft hover:text-ink">
                  {i.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/auth"
              className="hidden rounded-pill px-4 py-2 text-[15px] text-ink-soft hover:bg-bg-tint hover:text-ink md:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/assess"
              className="inline-flex items-center rounded-pill bg-primary px-[15px] py-2 text-[14px] font-medium text-on-primary hover:bg-primary-ink"
            >
              Check eligibility
            </Link>
          </div>
        </div>
      </header>
    );
  }
  // exhaustiveness guard
  variant satisfies never;
  return null;
}
```

> The `variant satisfies never` line ensures TS will error here when Phase 1 adds the `"app"` variant without handling it.

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/layout/app-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/layout/app-bar.tsx tests/components/layout/app-bar.test.tsx
git commit -m "feat: add AppBar marketing variant"
```

---

## Task 6: Route restructure — move existing pages into route groups

**Files:**
- Create: `app/(marketing)/layout.tsx`
- Create: `app/(focused)/layout.tsx`
- Move:   `app/page.tsx` → `app/(marketing)/page.tsx`
- Move:   `app/assess/page.tsx` → `app/(focused)/assess/page.tsx`
- Move:   `app/assessment/[id]/page.tsx` → `app/(focused)/assessment/[id]/page.tsx`
- Modify: `tests/app/assessment-page.test.tsx` — import path

- [ ] **Step 1: Create `(marketing)/layout.tsx`**

```tsx
// app/(marketing)/layout.tsx
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppBar variant="marketing" />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Create `(focused)/layout.tsx`**

```tsx
// app/(focused)/layout.tsx
import { FocusBar } from "@/components/layout/focus-bar";

export default function FocusedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FocusBar />
      <main>{children}</main>
    </>
  );
}
```

- [ ] **Step 3: Move the three existing pages**

```bash
git mv app/page.tsx app/(marketing)/page.tsx
git mv app/assess/page.tsx app/(focused)/assess/page.tsx
git mv app/assessment/[id]/page.tsx app/(focused)/assessment/[id]/page.tsx
# Remove the now-empty parent directories Next would otherwise still route on:
rmdir app/assess app/assessment/[id] app/assessment 2>/dev/null || true
```

> The placeholder homepage content stays as-is in this task. We rewrite it in Task 12.
> The moved pages already wrap their content in `<main>`. Strip the inner `<main>` wrappers so we don't double-nest now that the layouts add one.

- [ ] **Step 4: Strip duplicated `<main>` wrappers**

Edit `app/(marketing)/page.tsx`:

```tsx
// app/(marketing)/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-[720px] flex-col justify-center gap-6 px-5 py-10">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Honest answers for studying abroad
      </span>
      <h1 className="text-[clamp(38px,5.4vw,62px)]">Know your real chances before you spend a rupee.</h1>
      <p className="max-w-[52ch] text-[clamp(18px,1.5vw,21px)] text-ink-soft">
        MyVisa assesses your eligibility across academics, finances, visa strength, and profile — with transparent
        reasoning and no consultancy fees.
      </p>
      <div>
        <Link href="/assess">
          <Button size="lg">Check eligibility →</Button>
        </Link>
      </div>
    </div>
  );
}
```

Edit `app/(focused)/assess/page.tsx`:

```tsx
// app/(focused)/assess/page.tsx
import { AssessFlow } from "@/components/assess/assess-flow";

export default function AssessPage() {
  return <AssessFlow />;
}
```

Edit `app/(focused)/assessment/[id]/page.tsx` — change just the wrapper:

```tsx
// app/(focused)/assessment/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOwnedAssessment } from "@/lib/assessments/repo";
import { Results } from "@/components/results/results";
import type { AssessmentPayload } from "@/lib/results/types";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/assess");

  const row = await getOwnedAssessment(supabase, id);
  if (!row) notFound();

  const payload = row.result as unknown as AssessmentPayload;
  return <Results payload={payload} mode="owned" />;
}
```

- [ ] **Step 5: Fix the moved assessment-page test import path**

```tsx
// tests/app/assessment-page.test.tsx — change the import only
// Before: import AssessmentPage from "@/app/assessment/[id]/page";
// After:
import AssessmentPage from "@/app/(focused)/assessment/[id]/page";
```

Apply that single-line change. Leave the rest of the file untouched.

- [ ] **Step 6: Run the full suite + build to confirm the restructure didn't break anything**

```bash
npm test
npm run typecheck
npm run build
```

Expected: all green. The build output should list `/`, `/assess`, `/assessment/[id]` as routes (Next collapses route group parens in URLs).

- [ ] **Step 7: Commit**

```bash
git add app tests/app/assessment-page.test.tsx
git commit -m "refactor: move existing pages into (marketing) and (focused) route groups"
```

---

## Task 7: Eyebrow primitive

**Files:**
- Create: `components/marketing/eyebrow.tsx`
- Create: `tests/components/marketing/eyebrow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/eyebrow.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Eyebrow } from "@/components/marketing/eyebrow";

describe("Eyebrow", () => {
  it("renders its label uppercased in mono style", () => {
    render(<Eyebrow>For students applying abroad</Eyebrow>);
    const el = screen.getByText(/for students applying abroad/i);
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass("font-mono");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/marketing/eyebrow.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/marketing/eyebrow.tsx
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-wide text-primary">
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/marketing/eyebrow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/eyebrow.tsx tests/components/marketing/eyebrow.test.tsx
git commit -m "feat: add Eyebrow marketing primitive"
```

---

## Task 8: Tile primitive

**Files:**
- Create: `components/marketing/tile.tsx`
- Create: `tests/components/marketing/tile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/tile.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tile } from "@/components/marketing/tile";

describe("Tile", () => {
  it("renders the title, body, and (when provided) the badge", () => {
    render(
      <Tile
        title="SOP coach"
        body="Coaching on your own draft."
        badge="Soon"
        iconSvg={<span data-testid="icon" />}
      />,
    );
    expect(screen.getByText("SOP coach")).toBeInTheDocument();
    expect(screen.getByText("Coaching on your own draft.")).toBeInTheDocument();
    expect(screen.getByText("Soon")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("hides the badge slot when no badge is given", () => {
    render(<Tile title="X" body="Y" iconSvg={null} />);
    expect(screen.queryByText("Soon")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/marketing/tile.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/marketing/tile.tsx
export function Tile({
  title,
  body,
  iconSvg,
  badge,
}: {
  title: string;
  body: string;
  iconSvg: React.ReactNode;
  badge?: string;
}) {
  return (
    <article className="flex min-h-[200px] flex-col gap-3 rounded-lg border border-line bg-surface p-6">
      <div className="flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-primary-tint text-primary">
          {iconSvg}
        </span>
        {badge ? (
          <span className="inline-flex items-center rounded-pill bg-bg-tint px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-1 text-[21px]">{title}</h3>
      <p className="text-[15px] text-ink-soft">{body}</p>
    </article>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/marketing/tile.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/marketing/tile.tsx tests/components/marketing/tile.test.tsx
git commit -m "feat: add Tile marketing primitive for feature cards"
```

---

## Task 9: HeroPreview card

**Files:**
- Create: `components/marketing/hero-preview.tsx`
- Create: `tests/components/marketing/hero-preview.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/hero-preview.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroPreview } from "@/components/marketing/hero-preview";

describe("HeroPreview", () => {
  it("renders the feed header, next-best-step card, visa update, and two suggested prompts", () => {
    render(<HeroPreview />);
    expect(screen.getByText(/Your feed, once you're in/i)).toBeInTheDocument();
    expect(screen.getByText(/preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Your next best step/i)).toBeInTheDocument();
    expect(screen.getByText(/Add your IELTS report/i)).toBeInTheDocument();
    expect(screen.getByText(/Visa update/i)).toBeInTheDocument();
    expect(screen.getByText(/Strong match/i)).toBeInTheDocument();
    expect(screen.getByText(/Your guide/i)).toBeInTheDocument();
    expect(screen.getByText(/Is my gap a problem\?/i)).toBeInTheDocument();
    expect(screen.getByText(/How much must I show\?/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/marketing/hero-preview.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/marketing/hero-preview.tsx
export function HeroPreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      {/* header */}
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-[15px] font-medium text-ink">
          <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Your feed, once you're in
        </span>
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">preview</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
        {/* feed */}
        <div className="flex flex-col gap-3 border-b border-line p-5 lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-2 rounded-md bg-primary-tint p-4">
            <span className="inline-flex items-center gap-2 font-medium text-primary">
              <svg aria-hidden viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
              </svg>
              Your next best step
            </span>
            <p className="text-[15px] text-ink">
              Add your IELTS report to unlock 3 more matches and sharpen your Australia verdict.
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[15px] font-medium text-ink">🇦🇺 Visa update</span>
              <span className="inline-flex items-center rounded-pill bg-strong-tint px-2.5 py-0.5 font-mono text-[11.5px] text-strong">
                Strong match
              </span>
            </div>
            <p className="text-[15px] text-ink-soft">
              Australia's Genuine Student rules — your work gap is an asset here, not a liability.
            </p>
          </div>
        </div>

        {/* guide */}
        <div className="flex flex-col gap-3 bg-surface-2 p-5">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Your guide</span>
          <div className="rounded-md border border-line bg-surface p-4">
            <p className="text-[15px] text-ink">
              You're in good shape for Australia. The highest-impact thing right now is documenting your work gap — want to do it together?
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {["Is my gap a problem?", "How much must I show?"].map((q) => (
              <span
                key={q}
                className="inline-flex items-center justify-start rounded-pill border border-line bg-surface px-3 py-1.5 text-[14px] text-ink-soft"
              >
                {q}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/marketing/hero-preview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/hero-preview.tsx tests/components/marketing/hero-preview.test.tsx
git commit -m "feat: add HeroPreview card for the homepage"
```

---

## Task 10: HowItWorks 3-step card

**Files:**
- Create: `components/marketing/how-it-works.tsx`
- Create: `tests/components/marketing/how-it-works.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/how-it-works.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowItWorks } from "@/components/marketing/how-it-works";

describe("HowItWorks", () => {
  it("renders three numbered steps with titles and bodies", () => {
    render(<HowItWorks />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Tell us about you/i)).toBeInTheDocument();
    expect(screen.getByText(/See where you stand/i)).toBeInTheDocument();
    expect(screen.getByText(/Build your case/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/marketing/how-it-works.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/marketing/how-it-works.tsx
const STEPS = [
  ["1", "Tell us about you", "Where you're from, your grades in your own grade system, your budget. One question at a time."],
  ["2", "See where you stand", "A banded verdict with the factors that drove it — academic fit, budget, and how your gap reads."],
  ["3", "Build your case", "Track applications, work the checklist, and let your guide keep your visa info fresh."],
] as const;

export function HowItWorks() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid grid-cols-1 md:grid-cols-3">
        {STEPS.map(([n, t, b], i) => (
          <div
            key={n}
            className={
              "p-7 " +
              (i < STEPS.length - 1 ? "border-b border-line md:border-b-0 md:border-r" : "")
            }
          >
            <span className="font-mono text-[22px] font-medium text-primary">{n}</span>
            <h3 className="mt-3 text-[20px]">{t}</h3>
            <p className="mt-2 text-[15px] text-ink-soft">{b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/marketing/how-it-works.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/how-it-works.tsx tests/components/marketing/how-it-works.test.tsx
git commit -m "feat: add HowItWorks 3-step card"
```

---

## Task 11: TrustCallout

**Files:**
- Create: `components/marketing/trust-callout.tsx`
- Create: `tests/components/marketing/trust-callout.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/trust-callout.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrustCallout } from "@/components/marketing/trust-callout";

describe("TrustCallout", () => {
  it("renders the eyebrow, headline, lead, and two CTAs linking to /assess and /destinations", () => {
    render(<TrustCallout />);
    expect(screen.getByText(/Trust is the product/i)).toBeInTheDocument();
    expect(screen.getByText(/We sit before the consultancy/i)).toBeInTheDocument();
    expect(screen.getByText(/Every recommendation shows the factors behind it/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Check your eligibility/i })).toHaveAttribute("href", "/assess");
    expect(screen.getByRole("link", { name: /Browse destinations/i })).toHaveAttribute("href", "/destinations");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/marketing/trust-callout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/marketing/trust-callout.tsx
import Link from "next/link";
import { Eyebrow } from "./eyebrow";

export function TrustCallout() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pt-24 text-center">
      <Eyebrow>Trust is the product</Eyebrow>
      <h2 className="mt-4 text-[clamp(28px,3.4vw,38px)]">We sit before the consultancy, not in place of one.</h2>
      <p className="mx-auto mt-4 max-w-[58ch] text-[17px] text-ink-soft">
        Every recommendation shows the factors behind it. Every visa rule shows where it came from and when we last
        checked. If we ever earn referral revenue, you'll see it said plainly — right where it's relevant.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/assess"
          className="inline-flex items-center rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink"
        >
          Check your eligibility
        </Link>
        <Link
          href="/destinations"
          className="inline-flex items-center rounded-pill border border-line-2 px-7 py-[15px] text-[17px] text-ink hover:bg-bg-tint"
        >
          Browse destinations
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/marketing/trust-callout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/trust-callout.tsx tests/components/marketing/trust-callout.test.tsx
git commit -m "feat: add TrustCallout section"
```

---

## Task 12: Homepage composition

**Files:**
- Modify: `app/(marketing)/page.tsx` — full rewrite
- Create: `app/(marketing)/page.tsx` icon helpers inline (no extra file)
- Create: `components/layout/trust-strip.tsx` (already exists from Task 2)
- Create: `tests/app/marketing-home.test.tsx`

- [ ] **Step 1: Write the failing page test**

```tsx
// tests/app/marketing-home.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/(marketing)/page";

describe("Marketing homepage", () => {
  it("renders the headline, all three tiles, how-it-works, hero preview and trust callout", async () => {
    const ui = await HomePage();
    render(ui);
    expect(screen.getByText(/An honest answer before/i)).toBeInTheDocument();
    expect(screen.getByText(/Three quiet tools, no clutter/i)).toBeInTheDocument();
    expect(screen.getByText(/Eligibility & checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/An AI guide that remembers you/i)).toBeInTheDocument();
    expect(screen.getByText(/SOP coach/i)).toBeInTheDocument();
    expect(screen.getByText(/Tell us about you/i)).toBeInTheDocument();
    expect(screen.getByText(/Your feed, once you're in/i)).toBeInTheDocument();
    expect(screen.getByText(/We sit before the consultancy/i)).toBeInTheDocument();
  });

  it("renders the primary hero CTA pointing to /assess", async () => {
    const ui = await HomePage();
    render(ui);
    const ctas = screen.getAllByRole("link", { name: /Check your eligibility/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    expect(ctas[0]).toHaveAttribute("href", "/assess");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/app/marketing-home.test.tsx`
Expected: FAIL — homepage still has the old placeholder copy.

- [ ] **Step 3: Rewrite the homepage**

```tsx
// app/(marketing)/page.tsx
import Link from "next/link";
import { TrustStrip } from "@/components/layout/trust-strip";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Tile } from "@/components/marketing/tile";
import { TrustCallout } from "@/components/marketing/trust-callout";

function IconShield() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
function IconGuide() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      <TrustStrip />

      {/* hero */}
      <section className="mx-auto w-full max-w-[1120px] px-5 pb-6 pt-[72px]">
        <div className="max-w-[760px]">
          <Eyebrow>For students applying abroad</Eyebrow>
          <h1 className="mt-5 text-[clamp(42px,6vw,68px)] leading-[1.05]">
            An honest answer before
            <br />
            you pay anyone.
          </h1>
          <p className="mt-6 max-w-[58ch] text-[clamp(18px,1.5vw,21px)] text-ink-soft">
            Can I get in? What will it really cost? What's my visa risk? See where you stand in about two minutes
            — free, and no sign-up to start.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/assess"
              className="inline-flex items-center gap-2 rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink"
            >
              Check your eligibility →
            </Link>
            <span className="inline-flex items-center gap-2 text-[15px] text-ink-soft">
              <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 7v5l3 2" />
              </svg>
              About 2 minutes · no account needed
            </span>
          </div>
        </div>

        <div className="mt-16">
          <HeroPreview />
        </div>
      </section>

      {/* tiles */}
      <section className="mx-auto w-full max-w-[1120px] px-5 pt-20">
        <Eyebrow>What you get</Eyebrow>
        <h2 className="mt-4 max-w-[600px] text-[clamp(28px,3.4vw,38px)]">Three quiet tools, no clutter.</h2>
        <div className="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Tile
            title="Eligibility & checklist"
            body="A banded verdict — strong, possible, or reach — built from official thresholds, plus a document checklist with real deadlines."
            iconSvg={<IconShield />}
          />
          <Tile
            title="An AI guide that remembers you"
            body="Not a popup bot. A calm companion that powers a feed of matches, visa updates for your country, and your next best step."
            iconSvg={<IconGuide />}
          />
          <Tile
            title="SOP coach"
            body="Coaching on your own draft — structure, clarity, how you explain a study gap. A coach, never a ghostwriter."
            iconSvg={<IconDoc />}
            badge="Soon"
          />
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto mt-24 w-full max-w-[1120px] px-5">
        <HowItWorks />
      </section>

      <TrustCallout />
      <div className="h-20" />
    </>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/app/marketing-home.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/(marketing)/page.tsx tests/app/marketing-home.test.tsx
git commit -m "feat: build the marketing homepage to match Claude Design"
```

---

## Task 13: Marketing destinations data layer

**Files:**
- Create: `lib/marketing/destinations.ts`
- Create: `tests/marketing/destinations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/destinations.test.ts
import { describe, it, expect } from "vitest";
import { MARKETING_DESTINATIONS, getMarketingDestination } from "@/lib/marketing/destinations";

describe("marketing destinations registry", () => {
  it("ships exactly the six designed countries", () => {
    expect(MARKETING_DESTINATIONS.map((c) => c.id).sort()).toEqual(["au", "ca", "de", "ie", "uk", "us"].sort());
  });

  it("every entry has a non-empty source, lastVerified, tagline, tuition, and at least one doc", () => {
    for (const c of MARKETING_DESTINATIONS) {
      expect(c.source).toMatch(/^https?:\/\//);
      expect(c.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.tagline.length).toBeGreaterThan(10);
      expect(c.tuition.length).toBeGreaterThan(0);
      expect(c.docs.length).toBeGreaterThan(0);
    }
  });

  it("getMarketingDestination returns the entry by id or null", () => {
    expect(getMarketingDestination("au")?.name).toBe("Australia");
    expect(getMarketingDestination("xx")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/marketing/destinations.test.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```ts
// lib/marketing/destinations.ts
export type MarketingMatch = "strong" | "possible" | "reach";
export type RiskLevel = "calm" | "caution" | "warning";

export interface MarketingDestination {
  id: string;
  name: string;
  flag: string;
  tagline: string;
  match: MarketingMatch;
  tuition: string;
  living: string;
  financialProof: string;
  workRights: string;
  postStudy: string;
  risk: { level: RiskLevel; title: string; body: string };
  source: string;
  lastVerified: string;
  docs: string[];
}

export const MARKETING_DESTINATIONS: MarketingDestination[] = [
  {
    id: "au",
    name: "Australia",
    flag: "🇦🇺",
    tagline: "Strong post-study work rights, clear financial rules.",
    match: "strong",
    tuition: "A$33k–48k / yr",
    living: "A$29,710 / yr (proof required)",
    financialProof: "A$29,710 for living + first-year tuition + travel",
    workRights: "48 hrs / fortnight during term, unlimited in breaks",
    postStudy: "Temporary Graduate visa (485): 2–4 yrs",
    risk: {
      level: "caution",
      title: "Genuine Student (GS) requirement replaced GTE",
      body: "Since 2024 the Genuine Student requirement and higher savings thresholds apply. A clearly explained study gap strengthens your case.",
    },
    source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
    lastVerified: "2026-05-28",
    docs: ["Valid passport", "Offer letter (CoE)", "Genuine Student statement", "Proof of funds (A$29,710+)", "IELTS/PTE results", "OSHC health cover", "Academic transcripts"],
  },
  {
    id: "ca",
    name: "Canada",
    flag: "🇨🇦",
    tagline: "Provincial caps in effect — apply early.",
    match: "possible",
    tuition: "C$25k–38k / yr",
    living: "C$20,635 / yr (proof required)",
    financialProof: "C$20,635 living + tuition (outside Quebec)",
    workRights: "Up to 24 hrs / week off-campus during term",
    postStudy: "PGWP: up to 3 yrs (field-of-study rules apply)",
    risk: {
      level: "warning",
      title: "Provincial Attestation Letter (PAL) required",
      body: "IRCC capped study permits in 2024; every applicant needs a PAL from the province. Choose DLIs with available allocation early.",
    },
    source: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html",
    lastVerified: "2026-05-30",
    docs: ["Valid passport", "Letter of Acceptance", "Provincial Attestation Letter", "Proof of funds (C$20,635+)", "IELTS/CELPIP results", "Medical exam", "Statement of purpose"],
  },
  {
    id: "uk",
    name: "United Kingdom",
    flag: "🇬🇧",
    tagline: "Fast visa decisions; dependant rules tightened.",
    match: "possible",
    tuition: "£16k–32k / yr",
    living: "£12,006–13,348 / yr (proof required)",
    financialProof: "£12,006 outside London / £13,348 inside London (9 months) + first-year tuition",
    workRights: "20 hrs / week during term",
    postStudy: "Graduate Route: 2 yrs (3 yrs for PhD)",
    risk: {
      level: "caution",
      title: "Dependant visa restricted to research postgrad",
      body: "Since Jan 2024 only research-based postgraduate students can bring dependants. Plan accordingly if family is part of your move.",
    },
    source: "https://www.gov.uk/student-visa",
    lastVerified: "2026-05-26",
    docs: ["Valid passport", "CAS letter", "Proof of funds (28-day rule)", "IELTS for UKVI", "ATAS clearance (if applicable)", "TB test results", "Academic transcripts"],
  },
  {
    id: "de",
    name: "Germany",
    flag: "🇩🇪",
    tagline: "Low/no tuition at public universities.",
    match: "reach",
    tuition: "€0–3k / yr (public)",
    living: "€11,904 / yr (blocked account)",
    financialProof: "€11,904 in a blocked account (Sperrkonto)",
    workRights: "120 full / 240 half-days per year",
    postStudy: "18-month job-seeker residence permit",
    risk: {
      level: "caution",
      title: "German language often required for undergrad",
      body: "Many bachelor's programmes still require German B2/C1. English-taught master's are common but competitive — check programme by programme.",
    },
    source: "https://www.auswaertiges-amt.de/en/visa-service/-/231148",
    lastVerified: "2026-05-22",
    docs: ["Valid passport", "University admission letter", "Blocked account (€11,904)", "APS certificate (for India/China/Vietnam)", "TestDaF / DSH (or IELTS for English programmes)", "Health insurance", "CV + motivation letter"],
  },
  {
    id: "us",
    name: "United States",
    flag: "🇺🇸",
    tagline: "Largest choice; interview-based visa.",
    match: "reach",
    tuition: "$28k–60k / yr",
    living: "$15k–22k / yr",
    financialProof: "Tuition + living for the entire course shown on the I-20",
    workRights: "On-campus only first year (20 hrs / week)",
    postStudy: "OPT: 12 months (+24 for STEM)",
    risk: {
      level: "warning",
      title: "F-1 visa interview is the bottleneck",
      body: "Approval depends heavily on demonstrating non-immigrant intent and clear ties home. Refusal rates vary by consulate and month.",
    },
    source: "https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html",
    lastVerified: "2026-05-29",
    docs: ["Valid passport", "I-20 from SEVP school", "SEVIS I-901 fee receipt", "DS-160 confirmation", "Proof of funds for full programme", "TOEFL/IELTS", "Academic transcripts + test scores"],
  },
  {
    id: "ie",
    name: "Ireland",
    flag: "🇮🇪",
    tagline: "English-speaking EU; growing tech sector.",
    match: "possible",
    tuition: "€10k–25k / yr",
    living: "€10,000 / yr (proof required)",
    financialProof: "€10,000 + first-year tuition",
    workRights: "20 hrs / week during term, 40 hrs in breaks",
    postStudy: "Stay-Back: 1 yr (master's: 2 yrs)",
    risk: {
      level: "calm",
      title: "No recent rule changes",
      body: "Visa policy has been stable. Watch the Garda registration (IRP) queue once you arrive — book early.",
    },
    source: "https://www.irishimmigration.ie/coming-to-study-in-ireland/",
    lastVerified: "2026-05-20",
    docs: ["Valid passport", "Letter of acceptance", "Proof of funds (€10,000+)", "IELTS/TOEFL", "Private medical insurance", "Statement of purpose", "Academic transcripts"],
  },
];

export function getMarketingDestination(id: string): MarketingDestination | null {
  return MARKETING_DESTINATIONS.find((c) => c.id === id) ?? null;
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/marketing/destinations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/destinations.ts tests/marketing/destinations.test.ts
git commit -m "feat: add marketing destinations data layer (6 countries)"
```

---

## Task 14: DestinationCard

**Files:**
- Create: `components/destinations/destination-card.tsx`
- Create: `tests/components/destinations/destination-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/destinations/destination-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DestinationCard } from "@/components/destinations/destination-card";
import { getMarketingDestination } from "@/lib/marketing/destinations";

describe("DestinationCard", () => {
  it("renders flag, name, tagline, match verdict, tuition + lastVerified, and links to /destinations/[id]", () => {
    const au = getMarketingDestination("au")!;
    render(<DestinationCard destination={au} />);
    expect(screen.getByText("Australia")).toBeInTheDocument();
    expect(screen.getByText(au.tagline)).toBeInTheDocument();
    expect(screen.getByText(/Strong/i)).toBeInTheDocument();
    expect(screen.getByText(/A\$33k–48k \/ yr/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-28/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Australia/i })).toHaveAttribute("href", "/destinations/au");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/destinations/destination-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/destinations/destination-card.tsx
import Link from "next/link";
import type { MarketingDestination } from "@/lib/marketing/destinations";

const VERDICT_STYLE = {
  strong:   { label: "Strong match", cls: "bg-strong-tint text-strong" },
  possible: { label: "Possible",     cls: "bg-possible-tint text-possible" },
  reach:    { label: "Reach",        cls: "bg-reach-tint text-reach" },
} as const;

export function DestinationCard({ destination }: { destination: MarketingDestination }) {
  const v = VERDICT_STYLE[destination.match];
  return (
    <Link
      href={`/destinations/${destination.id}`}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6 text-left hover:border-line-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-flex h-8 w-10 items-center justify-center rounded-md border border-line bg-bg-tint text-xl leading-none">
            {destination.flag}
          </span>
          <span className="text-[19px] font-medium text-ink">{destination.name}</span>
        </div>
        <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 font-mono text-[11.5px] ${v.cls}`}>
          {v.label}
        </span>
      </div>
      <p className="text-[15px] text-ink-soft">{destination.tagline}</p>
      <hr className="border-line" />
      <div className="flex items-center justify-between font-mono text-[12.5px] text-ink-soft">
        <span>{destination.tuition}</span>
        <span>{destination.lastVerified}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/destinations/destination-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/destinations/destination-card.tsx tests/components/destinations/destination-card.test.tsx
git commit -m "feat: add DestinationCard"
```

---

## Task 15: Destinations index page

**Files:**
- Create: `app/(marketing)/destinations/page.tsx`
- Create: `tests/app/destinations-index.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/destinations-index.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DestinationsPage from "@/app/(marketing)/destinations/page";

describe("/destinations index", () => {
  it("renders the headline, lead, and all six country cards", async () => {
    const ui = await DestinationsPage();
    render(ui);
    expect(screen.getByText(/Six countries, done well/i)).toBeInTheDocument();
    for (const name of ["Australia", "Canada", "United Kingdom", "Germany", "United States", "Ireland"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/app/destinations-index.test.tsx`
Expected: FAIL — page unresolved.

- [ ] **Step 3: Implement**

```tsx
// app/(marketing)/destinations/page.tsx
import { Eyebrow } from "@/components/marketing/eyebrow";
import { DestinationCard } from "@/components/destinations/destination-card";
import { MARKETING_DESTINATIONS } from "@/lib/marketing/destinations";

export default function DestinationsPage() {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-10">
      <Eyebrow>Destinations</Eyebrow>
      <h1 className="mt-3 max-w-[700px] text-[clamp(34px,4.4vw,52px)] leading-[1.05]">
        Six countries, done well — depth and freshness over breadth.
      </h1>
      <p className="mt-4 max-w-[60ch] text-[17px] text-ink-soft">
        Visa rules, real costs, and what you'll need. Every page shows where the data came from and when we last
        checked.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MARKETING_DESTINATIONS.map((d) => (
          <DestinationCard key={d.id} destination={d} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/app/destinations-index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(marketing)/destinations/page.tsx tests/app/destinations-index.test.tsx
git commit -m "feat: add /destinations index page (6-card grid)"
```

---

## Task 16: Fact tile + DestinationDetail composition

**Files:**
- Create: `components/destinations/fact.tsx`
- Create: `components/destinations/destination-detail.tsx`
- Create: `tests/components/destinations/destination-detail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/destinations/destination-detail.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DestinationDetail } from "@/components/destinations/destination-detail";
import { getMarketingDestination } from "@/lib/marketing/destinations";

describe("DestinationDetail", () => {
  const au = getMarketingDestination("au")!;

  it("renders name, tagline, source line, visa risk card, all six facts and the docs list", () => {
    render(<DestinationDetail destination={au} />);
    expect(screen.getByText("Australia")).toBeInTheDocument();
    expect(screen.getByText(au.tagline)).toBeInTheDocument();
    expect(screen.getByText(/Genuine Student \(GS\) requirement replaced GTE/i)).toBeInTheDocument();
    for (const label of ["Tuition", "Living cost", "Financial proof", "Work rights", "Post-study", "Last checked"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const doc of au.docs) {
      expect(screen.getByText(doc)).toBeInTheDocument();
    }
  });

  it("links the CTA to /assess", () => {
    render(<DestinationDetail destination={au} />);
    expect(screen.getByRole("link", { name: /Check eligibility/i })).toHaveAttribute("href", "/assess");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/destinations/destination-detail.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `Fact`**

```tsx
// components/destinations/fact.tsx
export function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-primary">{label}</span>
      <span className={mono ? "font-mono text-[13px] text-ink" : "text-[16px] font-medium text-ink"}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Implement `DestinationDetail`**

```tsx
// components/destinations/destination-detail.tsx
import Link from "next/link";
import type { MarketingDestination } from "@/lib/marketing/destinations";
import { Fact } from "./fact";

const VERDICT_STYLE = {
  strong:   { label: "Strong match", cls: "bg-strong-tint text-strong" },
  possible: { label: "Possible",     cls: "bg-possible-tint text-possible" },
  reach:    { label: "Reach",        cls: "bg-reach-tint text-reach" },
} as const;

const RISK_STYLE = {
  calm:    "bg-strong-tint text-strong",
  caution: "bg-possible-tint text-possible",
  warning: "bg-reach-tint text-reach",
} as const;

export function DestinationDetail({ destination: c }: { destination: MarketingDestination }) {
  const v = VERDICT_STYLE[c.match];
  const sourceHost = c.source.replace(/^https?:\/\//, "").split("/")[0];

  return (
    <section className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-7">
      <Link
        href="/destinations"
        className="inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-[14px] text-ink-soft hover:bg-bg-tint"
      >
        ← All destinations
      </Link>

      {/* hero */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <span aria-hidden className="inline-flex h-10 w-12 items-center justify-center rounded-md border border-line bg-bg-tint text-2xl leading-none">
          {c.flag}
        </span>
        <h1 className="text-[clamp(36px,4.6vw,52px)] leading-[1.05]">{c.name}</h1>
        <span className={`inline-flex items-center rounded-pill px-3 py-1 font-mono text-[13px] ${v.cls}`}>
          {v.label}
        </span>
      </div>

      <p className="mt-3 max-w-[640px] text-[17px] text-ink-soft">{c.tagline}</p>

      <span className="mt-4 inline-flex flex-wrap items-center gap-2 font-mono text-[12.5px] text-ink-soft">
        ↻ updated {c.lastVerified}
        <span className="opacity-50">·</span>
        <a href={c.source} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {sourceHost}
        </a>
      </span>

      {/* risk */}
      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
        <div className={`flex items-center gap-2 border-b border-line px-5 py-3 ${RISK_STYLE[c.risk.level]}`}>
          <svg aria-hidden viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          </svg>
          <span className="font-medium">Current visa note</span>
        </div>
        <div className="flex flex-col gap-2 p-5">
          <span className="font-medium">{c.risk.title}</span>
          <p className="text-[15px] text-ink-soft">{c.risk.body}</p>
        </div>
      </div>

      {/* facts */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Tuition" value={c.tuition} />
        <Fact label="Living cost" value={c.living} />
        <Fact label="Financial proof" value={c.financialProof} />
        <Fact label="Work rights" value={c.workRights} />
        <Fact label="Post-study" value={c.postStudy} />
        <Fact label="Last checked" value={`${c.lastVerified} · ${sourceHost}`} mono />
      </div>

      {/* docs */}
      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
        <h3 className="text-[20px]">What you'll need</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {c.docs.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-primary" />
              <span className="text-[15px] text-ink">{d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-transparent bg-primary-tint p-6">
        <div className="flex flex-col gap-1">
          <span className="text-[18px] font-medium text-ink">Check your standing for {c.name}</span>
          <span className="text-[15px] text-ink-soft">Two minutes, no sign-up to start.</span>
        </div>
        <Link
          href="/assess"
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-[22px] py-3 text-[16px] font-medium text-on-primary hover:bg-primary-ink"
        >
          Check eligibility →
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run it and confirm pass**

Run: `npm test -- tests/components/destinations/destination-detail.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add components/destinations/fact.tsx components/destinations/destination-detail.tsx tests/components/destinations/destination-detail.test.tsx
git commit -m "feat: add DestinationDetail + Fact tile"
```

---

## Task 17: Destination detail page with [id]

**Files:**
- Create: `app/(marketing)/destinations/[id]/page.tsx`
- Create: `tests/app/destination-detail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/destination-detail.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const notFound = vi.fn(() => { throw new Error("NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound }));

import DestinationDetailPage from "@/app/(marketing)/destinations/[id]/page";

describe("/destinations/[id]", () => {
  beforeEach(() => notFound.mockClear());

  it("renders the country page for a valid id", async () => {
    const ui = await DestinationDetailPage({ params: Promise.resolve({ id: "au" }) });
    render(ui);
    expect(screen.getByText("Australia")).toBeInTheDocument();
  });

  it("calls notFound() for an unknown id", async () => {
    await expect(
      DestinationDetailPage({ params: Promise.resolve({ id: "xx" }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/app/destination-detail.test.tsx`
Expected: FAIL — page unresolved.

- [ ] **Step 3: Implement**

```tsx
// app/(marketing)/destinations/[id]/page.tsx
import { notFound } from "next/navigation";
import { DestinationDetail } from "@/components/destinations/destination-detail";
import { getMarketingDestination, MARKETING_DESTINATIONS } from "@/lib/marketing/destinations";

export function generateStaticParams() {
  return MARKETING_DESTINATIONS.map((c) => ({ id: c.id }));
}

export default async function DestinationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const destination = getMarketingDestination(id);
  if (!destination) notFound();
  return <DestinationDetail destination={destination} />;
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/app/destination-detail.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/(marketing)/destinations/[id]/page.tsx tests/app/destination-detail.test.tsx
git commit -m "feat: add /destinations/[id] detail page with static params"
```

---

## Task 18: `/how` and `/trust` stub pages

**Files:**
- Create: `app/(marketing)/how/page.tsx`
- Create: `app/(marketing)/trust/page.tsx`

> Both pages are intentionally minimal in Phase 0 — the spec ships them as content-TBD stubs. We don't add tests for stub content; the page-renders smoke is covered by the build step.

- [ ] **Step 1: Implement `/how`**

```tsx
// app/(marketing)/how/page.tsx
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function HowItWorksPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-12">
      <Eyebrow>How it works</Eyebrow>
      <h1 className="mt-3 text-[clamp(32px,4vw,46px)] leading-[1.1]">
        We score what's measurable. We tell you the rest.
      </h1>
      <p className="mt-4 text-[17px] text-ink-soft">
        Detailed methodology is on the way. For now: every verdict comes from official thresholds (academics, English,
        finances), every visa rule shows its source and the date we last checked it, and nothing is hidden behind a
        sign-up wall to start.
      </p>
      <div className="mt-6">
        <Link
          href="/assess"
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink"
        >
          Check your eligibility →
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implement `/trust`**

```tsx
// app/(marketing)/trust/page.tsx
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function TrustPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-12">
      <Eyebrow>Why trust us</Eyebrow>
      <h1 className="mt-3 text-[clamp(32px,4vw,46px)] leading-[1.1]">
        No agents. No hidden commissions. No upsells in disguise.
      </h1>
      <p className="mt-4 text-[17px] text-ink-soft">
        Detailed trust statement coming soon. Headline: every recommendation shows the factors behind it, every visa
        rule shows where it came from, and if we ever earn referral revenue you'll see it said plainly — right where
        it's relevant.
      </p>
      <div className="mt-6">
        <Link
          href="/destinations"
          className="inline-flex items-center gap-2 rounded-pill border border-line-2 px-7 py-[15px] text-[17px] text-ink hover:bg-bg-tint"
        >
          Browse destinations
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Confirm build**

Run: `npm run build`
Expected: PASS, with `/how` and `/trust` listed as static routes.

- [ ] **Step 4: Commit**

```bash
git add app/(marketing)/how/page.tsx app/(marketing)/trust/page.tsx
git commit -m "feat: add /how and /trust stub pages"
```

---

## Task 19: AuthCard client component

**Files:**
- Create: `components/auth/auth-card.tsx`
- Create: `tests/components/auth/auth-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/auth/auth-card.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

import { AuthCard } from "@/components/auth/auth-card";

describe("AuthCard", () => {
  beforeEach(() => signInWithOAuth.mockReset());

  it("starts collapsed and renders the Google CTA + privacy line", () => {
    render(<AuthCard />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByText(/Your profile is private/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
  });

  it("starts Google OAuth pointing at /auth/callback (no claim id on the standalone /auth)", async () => {
    render(<AuthCard />);
    await userEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback"),
        }),
      }),
    );
    const arg = signInWithOAuth.mock.calls[0]![0];
    expect(arg.options.redirectTo).not.toMatch(/claim=/);
  });

  it("reveals an email field behind the disclosure and shows a coming-soon notice on submit", async () => {
    render(<AuthCard />);
    await userEvent.click(screen.getByRole("button", { name: /Other ways to sign in/i }));
    const email = screen.getByLabelText(/email/i);
    await userEvent.type(email, "student@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Create account & save/i }));
    expect(await screen.findByText(/Email sign-in is coming soon/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/auth/auth-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/auth/auth-card.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthCard() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const continueWithGoogle = async () => {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice("Email sign-in is coming soon. For now please use Google.");
  };

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-7 px-5 pb-20 pt-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-md bg-primary text-on-primary">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10 12 5 2 10l10 5 10-5Z" />
            <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
          </svg>
        </span>
        <h1 className="text-[clamp(28px,3.4vw,38px)]">Save your result</h1>
        <p className="max-w-[42ch] text-[17px] text-ink-soft">
          We'll keep your verdict and checklist safe so you can pick up where you left off. No spam, no agents
          calling you.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
        <Button size="lg" onClick={continueWithGoogle} className="w-full">
          Continue with Google
        </Button>

        <p className="inline-flex items-center justify-center gap-2 text-[12.5px] text-ink-faint">
          <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Your profile is private. We never sell your data.
        </p>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-center font-mono text-[12.5px] uppercase tracking-wide text-ink-faint hover:text-ink"
        >
          {open ? "Hide other options" : "Other ways to sign in →"}
        </button>

        {open ? (
          <form onSubmit={submitEmail} className="mt-2 flex flex-col gap-3 border-t border-line pt-4">
            <label htmlFor="auth-email" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary"
            />
            <Button type="submit" variant="ghost" className="w-full">
              Create account & save
            </Button>
            {notice ? (
              <p role="status" className="text-[14px] text-ink-soft">
                {notice}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/components/auth/auth-card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/auth/auth-card.tsx tests/components/auth/auth-card.test.tsx
git commit -m "feat: add AuthCard with Google OAuth and disclosed email path"
```

---

## Task 20: `/auth` page

**Files:**
- Create: `app/(marketing)/auth/page.tsx`
- Create: `tests/app/auth-page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/auth-page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const getUser = vi.fn();
const redirect = vi.fn(() => { throw new Error("REDIRECT"); });
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth/auth-card", () => ({
  AuthCard: () => <div>auth-card</div>,
}));

import AuthPage from "@/app/(marketing)/auth/page";

describe("/auth page", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
  });

  it("renders the AuthCard when no user is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AuthPage();
    render(ui);
    expect(screen.getByText("auth-card")).toBeInTheDocument();
  });

  it("redirects to / when the user is already signed in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(AuthPage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/app/auth-page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// app/(marketing)/auth/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/auth-card";

export default async function AuthPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");
  return <AuthCard />;
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/app/auth-page.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/(marketing)/auth/page.tsx tests/app/auth-page.test.tsx
git commit -m "feat: add /auth page (Google OAuth via AuthCard)"
```

---

## Task 21: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass (Phases 0 + 1–3 previously shipped).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean. The route list should include:
- `/` (static)
- `/destinations` (static)
- `/destinations/[id]` (SSG via `generateStaticParams`, six paths)
- `/how`, `/trust` (static)
- `/auth` (dynamic — calls `getUser`)
- `/assess` (static or dynamic, unchanged behavior)
- `/assessment/[id]` (dynamic)
- `/api/assess`, `/api/leads`, `/auth/callback`, `/auth/signout` (existing)
- Middleware present

- [ ] **Step 5: Manual smoke**

Run: `npm run dev`. Visit each marketing route in the browser and verify:
- `/` — hero copy, hero preview card, three tiles, how-it-works, trust callout, footer, trust strip.
- `/destinations` — six country cards. Click "Australia" → routes to `/destinations/au`.
- `/destinations/au` — country detail with verdict, source line, facts, docs, CTA. Click "← All destinations" → back to grid.
- `/destinations/xx` (in URL bar) — 404.
- `/how`, `/trust` — stub copy + CTA.
- `/auth` — when signed out, AuthCard shows. Click disclosure → email field appears. Submit email → coming-soon notice.
- `/assess` → wizard. Complete the flow → results render → ConversionPaths Google button still works → callback claims and lands at `/assessment/[id]`. (Existing regression.)
- `/assessment/[id]` — owned mode renders. Sign out from cookie, refresh — redirects to `/assess`.

Stop the dev server.

- [ ] **Step 6: Tag a Phase 0 milestone commit (no code change)**

```bash
git commit --allow-empty -m "chore: Phase 0 marketing + chrome complete"
```

---

## Self-Review

**Spec coverage (§ of the design spec):**
- §3.1 route group layout — Tasks 6 (move) + Task 12 ($\ldots$) cover all three groups except `(app)/` (Phase 1).
- §3.2 layout components (AppBar marketing variant, FocusBar, Footer, TrustStrip, Logo) — Tasks 1–5.
- §3.3 auth flow reconciliation (AuthCard wired to existing `/auth/callback`, email behind disclosure) — Tasks 19–20.
- §6 Phase 0 ships list (`/`, `/destinations`, `/destinations/[id]`, `/how`, `/trust`, `/auth`, layout chrome, route groups, page relocations) — Tasks 6, 12, 15, 17, 18, 20.
- §6 Phase 0 acceptance (design pixel-close, sign-in to `/auth`, "Check eligibility" to `/assess`, existing wizard → results → ConversionPaths unchanged, `/destinations/au` reads from data, build + tests green) — Tasks 5, 11, 12, 14, 15, 17, 21.

**Placeholder scan:** every component has its full implementation in the plan. The only intentionally minimal pages are `/how` and `/trust` (§6 marks them as content-TBD); their fallback content is fully specified in Task 18. No `TBD`, `TODO`, or "implement appropriate X" anywhere.

**Type consistency:**
- `AppBar` takes `variant: "marketing"` everywhere; the `satisfies never` guard ensures Phase 1's "app" variant is a TS error until handled.
- `MarketingDestination` shape is used identically by `MARKETING_DESTINATIONS`, `getMarketingDestination`, `DestinationCard`, `DestinationDetail`, and the `[id]` page.
- `Logo({ href? })` is the only public API; all consumers pass no prop (`/`) or never override it.
- Verdict color classes (`bg-strong-tint text-strong`, etc.) are identical in `DestinationCard` and `DestinationDetail` — single source of truth in each component, copy is intentional to keep components decoupled (no shared map needed in Phase 0).
- All page components are async server components, except `AuthCard` which is `"use client"`. Page tests `await` the default export consistently.

**Cross-phase note:** the `(focused)/` group's layout uses `FocusBar` only. Phase 1 will introduce `(app)/` with the `"app"` AppBar variant; nothing in Phase 0 prevents that or relies on it not existing.

No issues to fix.
