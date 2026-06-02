# MyVisa

Trust-first platform for international students to assess their real chances of studying abroad before engaging consultancies.

## Project State

- **Phase:** Pre-MVP — design spec complete, implementation not started
- **Design spec:** `docs/superpowers/specs/2026-06-02-onboarding-mvp-design.md`
- **Prototype:** `index.html` (static React prototype from Claude Design — reference for design language only, not production code)
- **MVP scope:** Onboarding wizard → eligibility results for Nepal → Australia corridor

## Tech Stack

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Zod for validation
- **Database/Auth:** Supabase (PostgreSQL + Auth + Storage)
- **Deployment:** Vercel
- **Monitoring:** Sentry, PostHog, Upstash (rate limiting), BetterStack (uptime)

## Design Language

**"Calm authority"** — warm paper, deep teal, flat surfaces, thin borders. No gradients, no shadows, no visual noise.

- **Fonts:** Hanken Grotesk (sans), IBM Plex Mono (mono)
- **Primary:** `#0f5e54` (deep teal), dark mode: `#4eb39f`
- **Background:** `#f6f5f1` (warm paper), dark mode: `#111210`
- **Verdicts:** Strong `#1f6d4a`, Possible `#b07d22`, Reach `#b1503a`
- **Radii:** 8px (inputs), 12px (cards), 16px (panels), 999px (pills/buttons)
- **Motion:** `cubic-bezier(.22, .61, .36, 1)` everywhere
- **Dark mode:** Use `background-color` not `background` shorthand (CSS custom property re-resolution bug)
- Sentence case everywhere. No ALL CAPS except mono-up labels.
- Full token reference in the design spec, Section 7.

## Architecture Rules

- **Business logic lives in Next.js codebase**, not in Supabase functions or database triggers. Supabase is dumb storage + auth.
- **Scoring engine is server-side**, rule-based, and versioned. Never expose scoring rules in client JS.
- **Row-Level Security** enabled on every Supabase table from day one.
- **Every data point** has `source` and `lastVerified` fields.
- **Country data** is structured with source countries and destination countries as separate dimensions.
- **Zod validation** on every API endpoint.
- **No sensitive data** in URLs, query params, or client-side logs.

## Coding Standards

- TypeScript strict mode
- Tailwind for all styling — custom Tailwind config with the exact design tokens above, no default Tailwind colors
- Components should be small, single-purpose files
- Use server components by default, client components only when interactivity is needed
- Prefer named exports
- File naming: kebab-case for files, PascalCase for components

## Key Decisions

- MVP covers Nepal → Australia only. Architecture supports expansion without code changes.
- Wizard: 9 steps, one question per screen, linear flow with smart contextual callouts
- Results: banded verdicts (Strong/Possible/Reach), never percentages to users
- Gated content uses peek-through blur, not flat lock icons
- Assessment expiry: 3 days (urgency driver for account creation)
- Data is AI-researched, human-verified, manually maintained for v1
