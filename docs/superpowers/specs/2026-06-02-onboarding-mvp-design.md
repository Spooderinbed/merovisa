# MyVisa — Onboarding MVP Design Spec

**Date:** 2026-06-02
**Scope:** Eligibility wizard → results page (from "Check eligibility" click to account creation prompt)
**Target user:** Nepali students exploring study abroad options
**Target corridor:** Nepal → Australia (single source, single destination for MVP)
**Approach:** Linear wizard with smart interrupts (Approach A)

---

## 1. Product Context

MyVisa is a trust-first platform for international students that helps them understand their real chances of studying abroad before engaging consultancies or spending money. The onboarding flow is the core value proposition — it's where trust is built or lost.

The MVP validates one hypothesis: **Nepali students will complete the eligibility wizard and find the personalized results useful enough to create an account.**

### What the MVP includes
- Phase 1 wizard (9 steps, one question per screen, smart callouts)
- Animated profile recap transition
- Results page (verdict, factor breakdown, intake timing, university previews)
- Profile accuracy meter with sharpening prompts
- Gated content with peek-through blur
- Account creation (email + Google) with 3-day urgency
- Email-only capture as lighter conversion path
- Data for Nepal → Australia corridor only

### What the MVP does not include
- Document upload + OCR extraction
- Bank-specific loan guidance and procedures
- What-if nudges ("improve IELTS to 7.0 and...")
- Shareable result cards (WhatsApp/Viber optimized)
- "Not sure" multi-country comparison view
- Intake-aware week-by-week roadmap
- Additional source or destination countries
- Community contributions or AI-assisted data monitoring
- Dashboard, profile hub, AI guide, or any post-signup features

---

## 2. Onboarding Flow — Phase 1 Wizard

### Flow boundary
- **Starts:** User clicks "Check eligibility" on the landing page
- **Ends:** User sees personalized eligibility results

### UX pattern
One question per screen, Typeform-style. Full-screen focused input. Progress bar at top (segmented dots showing step count). Back button on every step. "Save & exit" option throughout.

### Step sequence

**Step 1 — Home country**
- Tappable cards: Nepal (default), India, Bangladesh, Pakistan, Nigeria, Other
- Selecting a country sets: grade system, currency, contextual tips, procedure data
- Sub-text: "This sets your grade scale and which visa rules we show you."

**Step 2 — Education level + grades**
- Three options: Higher secondary (+2), Bachelor's degree, Master's degree
- Grade system auto-selected based on country (Nepal → Percentage)
- Slider input for grade (40-100 for percentage)
- Sub-text: "Enter your result in your own grade system — we convert it for each destination."

**Step 3 — Intended field of study**
- 12 tappable cards showing common fields for Nepali students:
  - Computer Science / IT
  - Business / Management
  - Nursing / Health Sciences
  - Engineering
  - Hospitality / Hotel Management
  - Accounting / Finance
  - Data Science / AI
  - Education
  - Agriculture
  - Law
  - Arts / Social Sciences
  - Other (opens text input)
- Sub-text: "This affects which universities, fee ranges, and visa categories apply to you."

**Step 4 — Graduation year**
- Tappable options: 2026, 2025, 2024, 2023, 2022, 2021, 2020, Earlier (selecting "Earlier" shows a year input field, minimum 2010)
- System auto-calculates gap from current date — no separate "Do you have a gap?" step needed
- Sub-text: "We use this to assess your timeline and flag anything visa officers look at."
- **Smart callout (gap > 2yr):** "A [X]-year gap needs a clear explanation for visa purposes. We'll help you frame this."
- **Smart callout (gap > 5yr):** "Gaps over 5 years face extra scrutiny. Documented work experience during this period strengthens your case significantly."

**Step 5 — Gap explanation (conditional)**
- Only appears if graduation year implies a gap (> 0 years)
- Multi-select reasons:
  - Worked or interned
  - Retook / improved exams
  - Health or family reasons
  - Started something of my own
  - Preparing for tests / applications
- Sub-text: "Pick all that apply. Explaining this well actually strengthens your visa case."

**Step 6 — English proficiency**
- Three-way toggle: Not taken / Booked / Taken
- If "Taken": IELTS band slider (4.0–9.0, step 0.5)
- If "Not taken" or "Booked": no slider, system assumes minimum and adjusts results
- Sub-text: "Most destinations need proof of English. Even a planned test helps us tailor your matches."
- **Smart callout (IELTS < 6.5 + Australia):** "Most Australian universities require 6.5+. You can retake at British Council, Kathmandu."
- **Smart callout (Not taken):** "No score yet? We'll show you what you'd need and where to book in Kathmandu."

**Step 7 — Destination preference**
- Country cards: Australia, Canada, UK, Germany, USA, Ireland
- Plus: "Not sure yet — help me decide" option
- If "Not sure": results show multi-country comparison (post-MVP; for MVP, default to Australia with a note that more countries are coming)
- Sub-text: "Pick the one you're most curious about, or let us show you where you fit best."

**Step 8 — Yearly budget**
- Slider with NPR/USD toggle
- Default: NPR for Nepali students
- Show converted amount in the other currency below the slider
- Range: NPR 10 lakh – NPR 1 crore (or USD 8k – 80k)
- Funding source chips: Self-funded, Parents/family, Education loan, Mixed, Scholarship-dependent
- Sub-text: "Tuition plus living costs, per year. A rough figure is fine."
- **Smart callout (budget below typical):** "[Country] living costs alone are ~NPR [X] lakh/yr. Consider scholarships or loan support."
- **Smart callout (Scholarship-dependent):** "Scholarship-dependent is fine — we'll flag scholarship-friendly universities in your matches."

**Step 9 — What matters most**
- Single-select goal cards:
  - Permanent residency — "Settle long-term after study"
  - Lowest total cost — "Best value for money"
  - Highest-ranked university — "Prestige and brand"
  - Fastest admission — "Start as soon as possible"
  - Best employment outcomes — "Strong job prospects"
  - Research opportunities — "Academic and research depth"
- Sub-text: "This shapes how we rank your matches — same profile, different priorities, different results."
- Final CTA: "See where I stand →"

### Smart callout design
- Callouts are rule-based, not AI-generated
- Appear inline below the input when triggered
- Subtle style: small text, muted background, informational icon
- Each callout has: trigger condition, message, optional action link
- Only appear when the student's answer triggers a specific condition
- No callout when the student's answer is fine — silence signals confidence

---

## 3. Transition — Profile Recap & Results Reveal

### Animated profile recap (3-4 seconds)
After "See where I stand" tap:
- Screen dims, centered card builds up
- Student's data points animate in one at a time (0.5s per line, upward fade):
  ```
  Nepal · Bachelor's · Computer Science
  72% · IELTS 7.0
  1 year gap · Worked
  Australia · NPR 45 lakh/yr · Education loan
  Priority: Permanent residency
  ```
- Subtle analyzing pulse at bottom
- Purpose: confirms accuracy, builds anticipation, signals personalization
- Scoring is instant — the animation is theatrical

### Results reveal (sequenced animation)
Recap fades out, results build up in order:

1. Verdict card drops in (0.3s)
2. Factor bars animate to their values (0.8s each, staggered)
3. Intake timing fades in
4. University previews slide up
5. Gated teasers and conversion prompts appear last

---

## 4. Results Page

### Part A — Verdict
- Large verdict card: **Strong Match** / **Possible** / **Reach**
- One-line explanation: "You have a realistic shot, with a few areas to strengthen."
- For Reach verdicts: immediately show alternative — "Australia is a Reach, but Canada is a Strong Match for your profile." (post-MVP for multi-country; MVP shows improvement suggestions instead)
- Source line: "Based on rules verified [date] from [source]"

### Part B — Factor breakdown
Four horizontal bars with animated fill:
- **Academic fit** — grades vs. admission requirements for the field
- **Financial readiness** — budget vs. typical costs, funding source viability
- **Visa case strength** — gap, employment history, documentation indicators
- **Profile strength** — education level, field competitiveness, English score

Each bar is tappable to expand a "why" explanation:
- Lists the specific factors that contributed
- Example: "1-year gap: moderate risk · Education loan: acceptable · No prior refusals: positive"
- Every factor shows its influence direction (positive / neutral / risk)

### Part C — Intake timing (free)
```
Nearest realistic intake: February 2027
July 2026: Tight — IELTS needed by Aug 15, financials by Oct 1
```
- Calculated from: current date, graduation year, English status, destination intake cycles
- Detailed week-by-week roadmap is gated (post-MVP feature)

### Part D — University matches (preview)
- Top 2-3 matches shown in full: university name, match level tag, tuition range, field availability
- Remaining matches shown as peek-through blur — names partially visible, enough to read university names and flags, details locked
- Count shown: "12 universities matched your profile"
- "Unlock all matches" button → account creation

### Part E — Gated content teasers (peek-through blur)
Blurred preview cards with enough visible to create tension:
- "3 scholarships you may qualify for" — first scholarship name visible through blur
- "23-step Australia procedure guide from Nepal" — first 2-3 steps visible
- "14 documents in your checklist" — category headers visible
- Each teaser uses peek-through blur, not flat lock icons

### Part F — Profile accuracy meter
```
Profile completeness: 28%  |  Assessment accuracy: Basic

Sharpen your results:
• Upload your transcript     → exact grade verification
• Add financial documents    → precise budget assessment
• Verify English scores      → confirmed eligibility
```
- Shows what the student gains by completing each section
- Framed as improving accuracy, not just filling out a form

### Part G — Conversion paths (three tiers)

**Tier 1 — Full account (primary CTA)**
- Email input + Google sign-in button
- Framing: "Your assessment expires in 3 days. Create a free account to keep it and get updates as visa rules change."
- 3-day urgency creates conversion pressure

**Tier 2 — Email only (lighter commitment)**
- Single email input: "Email me my results"
- Captures the lead for re-engagement
- Lower friction for students who want to discuss with family first

**Tier 3 — Come back later**
- "Your assessment is available for 3 days"
- No capture, but the urgency is stated

---

## 5. Scoring Engine

### Architecture
- Server-side, rule-based, versioned
- Runs in Next.js API routes, not in the browser
- Each rule has: condition, weight, source, version number

### Four scoring dimensions

**Academic fit (0-100)**
- Inputs: education level, grade, field of study, destination requirements
- Logic: grade conversion to destination scale, comparison against typical admission thresholds for the field

**Financial readiness (0-100)**
- Inputs: yearly budget, funding source, destination cost of living + tuition
- Logic: budget vs. typical total cost, funding source reliability weighting

**Visa case strength (0-100)**
- Inputs: graduation year (gap), gap reasons, English status/score, home country risk profile
- Logic: gap penalty (scaled by length), gap reason mitigation, English threshold check, country-specific visa risk factors

**Profile strength (0-100)**
- Inputs: education level, field competitiveness, English score, goal alignment
- Logic: level weighting, field demand in destination, English above/below threshold

### Dimension weights
- Academic fit: 30%
- Financial readiness: 25%
- Visa case strength: 25%
- Profile strength: 20%

Weights are configurable per destination country (e.g., a country with stricter visa rules could weight visa case higher).

### Verdict mapping
- **Strong Match:** weighted average ≥ 72 AND no single dimension below 50
- **Possible:** weighted average ≥ 50 AND no single dimension below 30
- **Reach:** everything else

These thresholds are initial estimates and must be calibrated once real outcome data is available. Track predicted verdict vs. actual outcome (admission/rejection/visa result) to refine over time.

### Versioning
- Each assessment records the rule version used
- When rules change, old assessments remain explainable
- Students can re-run their assessment to see updated results

---

## 6. Data Architecture

### Schema structure

```
Source countries (Nepal for MVP)
  ├── grade_systems (Percentage, CGPA-4)
  ├── test_centers (IELTS locations in Kathmandu)
  ├── banks (post-MVP: loan rates, docs, procedures)
  └── procedures (post-MVP: transcript collection, police report, etc.)

Destination countries (Australia for MVP)
  ├── universities
  │     ├── programs (field, tuition, requirements)
  │     └── intakes (dates, deadlines)
  ├── visa_rules (requirements, processing times)
  ├── scholarships
  └── cost_of_living (city-level estimates)

Students
  ├── profiles (wizard answers)
  ├── scores (computed assessments, versioned)
  └── documents (post-MVP: uploaded files)
```

Source country and destination country are separate dimensions. Expansion means adding data to one dimension without touching the other.

### Data maintenance

**For MVP:** Data is AI-researched (deep research tools), human-verified against primary sources, and stored as structured TypeScript files in the codebase. One corridor (Nepal → Australia) is manageable manually.

**Every data point has:**
- `source` — where the information came from (URL or institution name)
- `lastVerified` — date of last human verification
- User-facing display: "Last verified: [date] from [source]"

**Staleness rules:**
- Tier 1 (slow-changing: bank rates, procedures, doc requirements): refresh every 90 days
- Tier 2 (seasonal: tuition, intakes, scholarships): refresh every 180 days
- Tier 3 (fast-changing: visa processing times, policy changes): refresh every 30 days
- Data past its tier threshold shows: "This information was last verified [X] months ago. Requirements may have changed — verify with [source]."

**Expansion path:** Same process per country — AI research → human verification → structured entry. Schema-driven, no code changes needed to add countries.

---

## 7. Design Language

The production app must maintain the exact design language established in the prototype (`index.html`). This section is the authoritative reference — when in doubt, match the prototype.

### Design philosophy
**"Calm authority."** Warm paper backgrounds, deep teal accents, flat surfaces, thin borders. No gradients, no drop shadows, no visual noise. The design communicates trustworthiness through restraint — it feels like a well-typeset document, not a flashy SaaS dashboard.

### Color tokens

**Light theme (default):**
| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#f6f5f1` | Page background — warm paper, not cold white |
| `bg-tint` | `#efeee8` | Subtle tinted backgrounds, track fills, hover states |
| `surface` | `#fffefb` | Cards, panels — almost-white with warm undertone |
| `surface-2` | `#faf9f5` | Secondary surfaces |
| `ink` | `#1d1c19` | Primary text — warm near-black, not pure `#000` |
| `ink-soft` | `#56544d` | Secondary text, descriptions |
| `ink-faint` | `#8a877d` | Tertiary text, placeholders, disabled states |
| `line` | `#1d1c190f` | Hairline borders — barely visible, just enough structure |
| `line-2` | `#1d1c191a` | Slightly stronger borders for interactive elements |
| `primary` | `#0f5e54` | Deep teal — buttons, links, active states, brand color |
| `primary-ink` | `#0c4a42` | Hover state for primary elements |
| `primary-tint` | `#0f5e5414` | Light teal wash — selected states, subtle highlights |
| `primary-tint-2` | `#0f5e5424` | Text selection highlight |
| `on-primary` | `#fcfdfb` | Text on primary-colored backgrounds |
| `accent` | `#b07d22` | Amber — progress indicators, positive-only contexts |

**Semantic verdict colors:**
| Token | Value | Usage |
|-------|-------|-------|
| `strong` / `strong-tint` | `#1f6d4a` / `#1f6d4a16` | Strong Match — green |
| `possible` / `possible-tint` | `#b07d22` / `#b07d2216` | Possible — amber |
| `reach` / `reach-tint` | `#b1503a` / `#b1503a16` | Reach — warm red |

**Dark theme:** Full dark token set exists in the prototype CSS. Uses `[data-theme="dark"]` attribute on `<html>`. Key difference: primary shifts to `#4eb39f` (lighter teal for contrast), backgrounds go to `#111210` (warm dark, not pure black). Use `background-color` not `background` shorthand to ensure CSS custom properties re-resolve on theme switch.

### Typography

**Fonts:**
- Sans: **Hanken Grotesk** (Google Fonts) — clean, geometric, slightly warm
- Mono: **IBM Plex Mono** — used for metadata, labels, timestamps, data points

**Scale:**
| Class | Size | Usage |
|-------|------|-------|
| `display` | `clamp(38px, 5.4vw, 62px)` | Hero headlines only |
| `h1` | `clamp(30px, 3.6vw, 42px)` | Page/section titles |
| `h2` | `clamp(24px, 2.4vw, 30px)` | Sub-section headers |
| `h3` | `21px` | Card headers |
| `lead` | `clamp(18px, 1.5vw, 21px)` | Intro paragraphs, `ink-soft` color |
| `body` | `17px` | Default body text |
| `small` | `15px` | Secondary text, descriptions |
| `mono` | `12.5px` | Metadata, timestamps, labels |
| `mono-up` | `11.5px` uppercase | Section eyebrows, category labels |

**Rules:**
- Headings: weight 500 (medium, not bold), line-height 1.18, letter-spacing -0.012em
- Body: weight 400, line-height 1.6
- Sentence case everywhere — never ALL CAPS except `mono-up` labels
- `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs

### Spacing & layout

- Max content width: `1120px` (wrap), `720px` (narrow wrap — wizard, forms)
- Page padding: `28px` horizontal (20px on mobile)
- Card padding: `24px`
- Spacing scale: 6px / 10px / 16px / 24px / 36px (gap-1 through gap-5)
- Border radius: `8px` (small/inputs), `12px` (cards), `16px` (large panels), `999px` (pills/buttons)

### Component patterns

**Cards:** White surface, 1px `line` border, 12px radius. No shadows ever. Content separated by `hairline` (1px `line` background).

**Buttons:**
- Primary: `primary` bg, `on-primary` text, pill shape, 1px active press
- Ghost: transparent bg, `line-2` border, `ink` text
- Quiet: no border, `ink-soft` text, subtle `bg-tint` on hover
- Sizes: default (16px/12px 22px), large (17px/15px 28px), small (14px/8px 15px)

**Option cards (`.opt`):** Full-width selectable cards with radio mark. Surface bg, `line-2` border. Selected state: `primary` border + `primary-tint` background. Used for all wizard single/multi-select inputs.

**Segmented controls (`.seg`):** Pill-shaped toggle group. `bg-tint` track, `surface` bg on active segment. Used for grade system toggle, English status, etc.

**Tags/chips:** Pill-shaped, semantic colors for verdicts (`tag-strong`, `tag-possible`, `tag-reach`), `primary-tint` for highlights, `bg-tint` for neutral.

**Progress bars:** 8px tall, pill-shaped track in `bg-tint`, colored fill with 0.9s ease transition.

**Sliders:** Custom styled range inputs. 8px `bg-tint` track, 26px circular thumb with `surface` fill and `primary` border.

**Navigation bar:** Sticky top, frosted glass effect (`color-mix(in srgb, var(--bg) 82%, transparent)` + `backdrop-filter: saturate(1.4) blur(14px)`), 1px bottom border.

### Motion

- Easing: `cubic-bezier(.22, .61, .36, 1)` — smooth deceleration, used everywhere
- Transitions: 0.15s for interactive states (hover, focus), 0.18s for buttons, 0.9s for progress bars
- Animations: `fade-in` (0.5s opacity), `rise-in` (0.55s opacity + 12px translateY)
- Active button press: `translateY(1px)`

### Icons
- Stroke-based SVGs, not filled
- Default stroke width: 1.5px
- Sizes: 13-20px depending on context
- Color inherits from parent or set explicitly

### Responsive
- Breakpoint: 860px
- Mobile: font-size drops to 16px, padding to 20px, grid layouts collapse to single column
- `.hide-mobile` utility for desktop-only elements (e.g., sidebar)

### Tailwind implementation
All tokens above map to a custom Tailwind config. The `tailwind.config.ts` should extend the default theme with these exact values — colors, fonts, spacing, radii, and the custom easing function. No default Tailwind colors should bleed through; the palette is fully custom.

---

## 8. Technical Stack

### Frontend
- **Next.js 14+ (App Router)** — SSR for landing page SEO, file-based routing, server components
- **TypeScript** — type safety for complex data schemas, living documentation
- **Tailwind CSS** — utility-first styling implementing the design tokens (teal primary, warm paper background, thin borders)

### Backend
- **Next.js API Routes** — scoring engine, data fetching, profile management
- **Zod** — input validation on every API endpoint

### Database & Auth
- **Supabase** — PostgreSQL database, Auth (email + Google), Storage (post-MVP)
- **Row-Level Security** enabled on all tables from day one
- Business logic lives in Next.js codebase, not in Supabase functions — keeps the database layer swappable

### Deployment
- **Vercel** — automatic deployments from Git, preview URLs, edge functions
- **GitHub** — source control, Actions for CI/CD

### Monitoring (all free tier)
- **Sentry** — error tracking (frontend + API)
- **PostHog** — funnel analytics, wizard drop-off tracking
- **Upstash** — rate limiting on API routes
- **BetterStack** — uptime monitoring + alerts

### Cost
- MVP: $0/month on free tiers
- Growth (~10k users): ~$50-75/month (Supabase Pro + Vercel Pro)

---

## 9. Security

### Authentication
- Supabase Auth with email verification enforced
- Google sign-in as primary (no password to leak)
- Rate limiting on login attempts (Supabase built-in + Upstash)

### Data protection
- Row-Level Security on every Supabase table — students can only access their own data
- Supabase encrypts at rest (AES-256)
- Application-level encryption for extra-sensitive fields (visa history, financial documents) in post-MVP
- No sensitive data in URLs, query params, or client-side logs
- Student IDs as UUIDs, not sequential integers

### API security
- All API routes require authentication except initial wizard submission
- Zod validation on every request body
- CORS locked to production domain only
- Rate limiting on scoring endpoints

### Infrastructure
- Environment variables for all secrets (never committed to git)
- Separate Supabase projects for dev/staging/production
- Supabase audit logs enabled
- Monthly `npm audit` + Dependabot for dependency updates

### Compliance
- GDPR readiness: data export, account deletion, consent tracking
- Right to deletion: cascade deletes, not soft deletes
- Data retention policy: inactive accounts purged after 2 years
- Privacy policy required before launch

---

## 10. Post-MVP Roadmap

Listed in priority order based on user value and feasibility:

1. **Document upload + OCR extraction** — transcript, IELTS report, bank statements. Extract → verify → refine assessment.
2. **Bank-specific loan guidance (Nepal)** — NMB, Nabil, Global IME etc. Rates, requirements, procedures, processing times.
3. **Full loan procedure walkthrough** — step-by-step from admission letter to loan sanction to visa financial proof.
4. **What-if nudges** — "Improve IELTS from 6.5 → 7.0 and 4 more universities become Strong Match."
5. **Shareable result cards** — optimized for WhatsApp/Viber sharing (Nepali student communication channels).
6. **"Not sure" multi-country comparison** — side-by-side verdict cards across all supported destinations.
7. **Intake-aware weekly roadmap** — working backwards from application deadline, personalized timeline.
8. **Additional destination countries** — Canada, UK (next most common for Nepali students).
9. **Additional source countries** — India (largest adjacent market, similar education system).
10. **Dashboard / command centre** — post-signup experience with profile hub, feed, checklist, AI guide.
11. **Community contributions** — verified students submit procedure updates, human-reviewed before publishing.
12. **AI-assisted data monitoring** — agents scrape university/immigration sites, flag changes for review.

---

## 11. Success Metrics

### Primary (validates the hypothesis)
- **Wizard completion rate:** % of users who click "Check eligibility" and reach results. Target: >60%.
- **Account creation rate:** % of users who see results and create an account. Target: >25%.

### Secondary
- **Wizard drop-off by step:** identifies which questions cause abandonment
- **Email capture rate:** % who choose "Email me my results" instead of full account
- **Time to complete wizard:** target under 3 minutes
- **Return rate:** % of email-captured users who come back within 3 days

---

*This spec covers the onboarding MVP only. Dashboard, profile hub, AI guide, and post-signup features will be designed in separate specs.*
