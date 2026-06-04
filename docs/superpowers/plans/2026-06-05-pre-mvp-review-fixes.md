# Pre-MVP Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all P0–P4 findings from the 2026-06-05 four-agent pre-MVP audit. Bring MyVisa from "shipped but broken in subtle ways" to "ready for real users".

**Architecture:** Five phases ordered by impact. Phase A fixes data corruption and must ship first. Phases B–E are independently shippable.

**Tech Stack:** Next.js 16, Supabase (Postgres + Storage + Auth), TypeScript strict, Zod, Vitest.

**Source review:** Four parallel agents (spec compliance, route + auth, integration + data flow, security + DX) plus a manual UX walkthrough. ~120 raw findings deduped into 32 fixes across 5 phases.

**Estimated total:** 14–18 hours.

---

## Critical context — the central bug

`ProfileSections` (DB-stored, editor-driven) and `StudentProfile` (scoring engine input) use **different enum values for the same concepts**. Every signed-in user's first re-score silently corrupts their verdict because the bidirectional mapping is broken in 6 places (funding source, education level, gap reasons, currency, field of study, career goal).

This was masked because tests only exercise one direction at a time, and the wizard happens to produce StudentProfile-valued inputs that look fine until the editor saves a section.

**Phase A fixes this root cause.** Everything else is downstream.

---

## File Map (all touched files)

### New files
```
lib/types/enums.ts                          — single canonical source for shared enums
lib/text/humanize.ts                        — enum → human-readable label
lib/rate-limit/upstash.ts                   — rate limit wrapper (with no-op fallback when not configured)
lib/auth/hmac-claim.ts                      — sign/verify the OAuth claim param
app/api/documents/[id]/view/route.ts        — lazy signed-URL endpoint
supabase/migrations/YYYYMMDD_fix_documents_rls.sql
supabase/migrations/YYYYMMDD_normalize_profile_enums.sql
docs/superpowers/specs/2026-06-04-phase-4-plan-generator-design.md
```

### Modified files
```
lib/scoring/types.ts                        — export shared enums + remove duplicates
lib/profiles/sections.ts                    — strict enum types
lib/validation/profile-section.ts           — z.enum everywhere
lib/profiles/from-assessment.ts             — keep canonical values
lib/scoring/from-sections.ts                — drop MAP tables (no longer needed)
lib/assessments/re-score.ts                 — rebuild full AssessmentPayload
lib/documents/repo.ts                       — drop unsafe casts after types regen
lib/supabase/types.ts                       — regenerated from current schema
components/profile/editors/finance-editor.tsx
components/profile/editors/gap-editor.tsx
components/profile/editors/career-editor.tsx
components/profile/editors/intended-study-editor.tsx
components/profile/editors/work-editor.tsx     — see Phase A.1
components/profile/section-accordion.tsx       — humanize summary text
app/api/dev/sign-in/route.ts                  — second gate + random password
app/api/assess/route.ts                       — rate limit + surface errors + post-claim re-score
app/api/leads/route.ts                        — rate limit
app/api/profile/section/route.ts              — error surfacing
app/api/documents/upload/route.ts             — sanitize filename, magic bytes, lazy URLs
app/auth/callback/route.ts                    — HMAC verify claim + UUID guard
app/auth/signout/route.ts                     — Origin check
app/(app)/layout.tsx                          — preserve next path
app/(app)/documents/page.tsx                  — drop server-rendered signed URLs
app/(app)/dashboard/page.tsx                  — rename stat label, banded language
app/(app)/checklist/page.tsx                  — redirect to /documents
app/(app)/matches/page.tsx                    — drop stale Phase 4 copy
app/(marketing)/page.tsx                      — redirect signed-in users
app/(marketing)/how/page.tsx                  — real content
app/(marketing)/trust/page.tsx                — real content
next.config.ts                                — security headers
lib/auth/safe-next.ts                         — harden against open redirect
middleware.ts                                 — exclude /api/leads
docs/superpowers/specs/2026-06-04-phase-5-documents-and-ocr-design.md  — supersede notice
```

---

## Phase A — DATA INTEGRITY (P0) — ~4 hours

**Ship first. Without this, every signed-in user gets silently degraded scoring on every profile save.**

### Task A.1: Unify ProfileSections + StudentProfile enums

**Decision:** `StudentProfile` enum values (already in `lib/scoring/types.ts`) become canonical. `ProfileSections` adopts them verbatim. The MAP tables in `from-sections.ts` disappear.

**Files:**
- Create: `lib/types/enums.ts`
- Modify: `lib/scoring/types.ts`, `lib/profiles/sections.ts`, `lib/validation/profile-section.ts`
- Modify: `lib/profiles/from-assessment.ts`, `lib/scoring/from-sections.ts`
- Modify: 5 editor components
- Migration: `YYYYMMDD_normalize_profile_enums.sql`
- Test: `tests/profiles/enum-roundtrip.test.ts`

**Steps:**

- [ ] **A.1.1: Write the round-trip test (TDD)**

Create `tests/profiles/enum-roundtrip.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import type { StudentProfile } from "@/lib/scoring/types";

describe("ProfileSections ↔ StudentProfile enum round-trip", () => {
  const original: StudentProfile = {
    homeCountry: "nepal",
    destination: "australia",
    educationLevel: "higher-secondary",   // 1
    gradeSystem: "percentage-nepal",
    grade: 72,
    fieldOfStudy: "computer-science",      // 2
    graduationYear: 2025,
    gapReasons: ["worked", "health-family"], // 3
    englishStatus: "taken",
    englishScore: 6.5,
    budget: 3_000_000,
    budgetCurrency: "NPR",
    fundingSource: "parents-family",       // 4
    goal: "permanent-residency",            // 5
  };

  test("round-trips without value drift", () => {
    const sections = profileSectionsFromAssessment(original as unknown as Record<string, unknown>, {}, { nowYear: 2026 });
    const recovered = sectionsToStudentProfile(sections);
    expect(recovered.educationLevel).toBe(original.educationLevel);
    expect(recovered.fieldOfStudy).toBe(original.fieldOfStudy);
    expect(recovered.gapReasons).toEqual(original.gapReasons);
    expect(recovered.fundingSource).toBe(original.fundingSource);
    expect(recovered.goal).toBe(original.goal);
    expect(recovered.budgetCurrency).toBe(original.budgetCurrency);
  });
});
```

Run: `npx vitest run tests/profiles/enum-roundtrip.test.ts`
Expected: FAIL — current code drifts every field.

- [ ] **A.1.2: Update `ProfileSections` interface**

In `lib/profiles/sections.ts`, replace string-typed fields with enum types imported from `lib/scoring/types.ts`:

```typescript
import type { EducationLevel, GradeSystem, FieldOfStudy, GapReason, FundingSource, Goal, Currency } from "@/lib/scoring/types";

export interface ProfileSections {
  personal?:        { name?: string; age?: number; intakeIso?: string };
  destination?:     { primary?: string; alternates?: string[] };
  academic?:        { institution?: string; degree?: EducationLevel; gradePercent?: number; gradeSystem?: GradeSystem };
  "intended-study"?: { level?: EducationLevel; field?: FieldOfStudy; specialisation?: string };
  english?:         { test?: "ielts" | "pte" | "toefl"; overall?: number; listening?: number; reading?: number; writing?: number; speaking?: number; reportUploaded?: boolean };
  gap?:             { years?: number; reasons?: GapReason[]; evidence?: string[] };
  work?:            { title?: string; years?: number; relevance?: "directly-related"|"related"|"unrelated"; docs?: boolean };
  finance?:         { total?: number; currency?: Currency; source?: FundingSource; proofUploaded?: boolean };
  immigration?:     { refusals?: "none"|"one"|"multiple"; travelled?: boolean };
  family?:          { situation?: "alone"|"spouse"|"spouse-and-kids"|"other" };
  career?:          { goal?: Goal; targetRole?: string };
  scholarships?:    { profile?: string[] };
  "deal-breakers"?: { mustHaves?: string[] };
}
```

- [ ] **A.1.3: Tighten Zod schemas**

In `lib/validation/profile-section.ts`, replace string-based schemas with `z.enum`:

```typescript
import { EDUCATION_LEVELS, GRADE_SYSTEMS, FIELDS_OF_STUDY, GAP_REASONS, FUNDING_SOURCES, GOALS, CURRENCIES } from "@/lib/scoring/types";

const AcademicPatch = z.object({
  institution: z.string().min(1).max(200).optional(),
  degree: z.enum(EDUCATION_LEVELS).optional(),
  gradePercent: z.number().min(0).max(100).optional(),
  gradeSystem: z.enum(GRADE_SYSTEMS).optional(),
});

const IntendedStudyPatch = z.object({
  level: z.enum(EDUCATION_LEVELS).optional(),
  field: z.enum(FIELDS_OF_STUDY).optional(),
  specialisation: z.string().min(1).max(160).optional(),
});

const GapPatch = z.object({
  years: z.number().int().min(0).max(20).optional(),
  reasons: z.array(z.enum(GAP_REASONS)).max(5).optional(),
  evidence: z.array(z.string().min(1).max(160)).max(5).optional(),
});

const FinancePatch = z.object({
  total: z.number().min(0).max(1_000_000_000).optional(),
  currency: z.enum(CURRENCIES).optional(),
  source: z.enum(FUNDING_SOURCES).optional(),
  proofUploaded: z.boolean().optional(),
});

const CareerPatch = z.object({
  goal: z.enum(GOALS).optional(),
  targetRole: z.string().min(1).max(120).optional(),
});
```

Note: this is breaking — old saved values like `"parents"` no longer parse. See A.1.6 for the migration.

- [ ] **A.1.4: Drop the MAP tables in `from-sections.ts`**

In `lib/scoring/from-sections.ts`, remove `FUNDING_MAP` and `DEGREE_MAP` — they no longer exist. Read values straight through:

```typescript
export function sectionsToStudentProfile(sections: ProfileSections): StudentProfile {
  const academic = sections.academic;
  const english = sections.english;
  const finance = sections.finance;
  const gap = sections.gap;
  const career = sections.career;
  const dest = sections.destination;
  const study = sections["intended-study"];

  const hasScore = english?.overall != null;
  const hasTest = english?.test != null;
  const currentYear = new Date().getUTCFullYear();
  const gapYears = gap?.years ?? 0;

  return {
    homeCountry: "nepal",
    destination: dest?.primary as StudentProfile["destination"] ?? "australia",
    educationLevel: academic?.degree ?? "bachelors",
    gradeSystem: academic?.gradeSystem ?? "percentage-nepal",
    grade: academic?.gradePercent ?? 0,
    fieldOfStudy: study?.field ?? "other",
    graduationYear: gapYears > 0 ? currentYear - gapYears : currentYear,
    gapReasons: gap?.reasons ?? [],
    englishStatus: hasScore ? "taken" : hasTest ? "booked" : "not-taken",
    englishScore: english?.overall,
    budget: finance?.total ?? 0,
    budgetCurrency: finance?.currency ?? "NPR",
    fundingSource: finance?.source ?? "self-funded",
    goal: career?.goal ?? "permanent-residency",
  };
}
```

- [ ] **A.1.5: Update editor components**

For each editor that hardcodes its own enum values, replace with the shared constants:

`finance-editor.tsx` — `<option value="parents">Parents</option>` becomes `<option value="parents-family">Parents/family</option>`. Same for `loan` → `education-loan`, `scholarship` → `scholarship-dependent`, `self` → `self-funded`.

`gap-editor.tsx` — replace the editor's option list with `GAP_REASONS` from `lib/scoring/types.ts` (`worked`, `retook-exams`, `health-family`, `started-something`, `preparing`).

`career-editor.tsx` — replace with `GOALS`.

`intended-study-editor.tsx` — change `field` from a free text `<input>` to a `<select>` bound to `FIELDS_OF_STUDY`.

`work-editor.tsx` — verify its enum values match.

For each, use a humanize() helper (defined in Phase D.2) so users see "Parents/family" not "parents-family".

- [ ] **A.1.6: Data migration for existing rows**

Create `supabase/migrations/YYYYMMDD_normalize_profile_enums.sql`:

```sql
-- Normalize legacy short-form enum values in profiles.sections to match
-- StudentProfile canonical values. Idempotent.

update public.profiles set sections = jsonb_set(
  sections, '{finance,source}',
  case sections->'finance'->>'source'
    when 'self' then '"self-funded"'::jsonb
    when 'parents' then '"parents-family"'::jsonb
    when 'loan' then '"education-loan"'::jsonb
    when 'scholarship' then '"scholarship-dependent"'::jsonb
    else sections->'finance'->'source'
  end
) where sections->'finance'->>'source' in ('self','parents','loan','scholarship');

update public.profiles set sections = jsonb_set(
  sections, '{academic,degree}',
  case sections->'academic'->>'degree'
    when 'high-school' then '"higher-secondary"'::jsonb
    else sections->'academic'->'degree'
  end
) where sections->'academic'->>'degree' = 'high-school';
```

Apply via Supabase MCP `apply_migration`.

- [ ] **A.1.7: Run all tests + commit**

```bash
npx vitest run
npx tsc --noEmit
git add -A
git commit -m "fix(scoring): unify ProfileSections ↔ StudentProfile enums

Single canonical enum set in lib/scoring/types.ts.
Removes MAP translation tables that silently dropped values.
Tightens Zod schemas to z.enum. Migrates legacy short-form values."
```

---

### Task A.2: Plug the documents RLS hole

Currently `with check (true)` lets any authenticated user `INSERT` a documents row with arbitrary `owner` UUID via the browser anon client.

**Files:** new migration

- [ ] **A.2.1: Write migration**

`supabase/migrations/YYYYMMDD_fix_documents_rls.sql`:

```sql
-- Tighten documents RLS — INSERT should be service-role only.
-- Mirror the assessments/profiles pattern.

drop policy if exists "Service inserts documents" on public.documents;

create policy "Service inserts documents"
  on public.documents for insert
  to service_role
  with check (true);

alter table public.documents force row level security;

revoke all on public.documents from anon, authenticated;
grant select, delete on public.documents to authenticated;

-- Same fix for storage policies
drop policy if exists "Service uploads document files" on storage.objects;

create policy "Service uploads document files"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'documents');
```

- [ ] **A.2.2: Apply via Supabase MCP + commit**

```bash
git add supabase/migrations/
git commit -m "fix(rls): restrict documents INSERT policy to service_role"
```

---

### Task A.3: Harden dev sign-in

**Files:** `app/api/dev/sign-in/route.ts`

- [ ] **A.3.1: Add second gate + random password**

```typescript
const DEV_EMAIL = process.env.DEV_USER_EMAIL ?? "dev@merovisa.local";

function ensureDevAllowed(): { allowed: boolean; reason?: string } {
  if (process.env.NODE_ENV === "production") return { allowed: false, reason: "production" };
  if (process.env.ENABLE_DEV_SIGNIN !== "1") return { allowed: false, reason: "not enabled" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1|supabase\.co.*dev|local/i.test(url)) {
    // Refuse if supabase URL looks like production. Permit dev/local/staging URLs.
    // Tweak the regex for your dev Supabase host.
  }
  return { allowed: true };
}

// Generate a random password per-session, store nothing
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}
```

Then in the route handler:

```typescript
const { allowed, reason } = ensureDevAllowed();
if (!allowed) return new NextResponse("Not found", { status: 404 });

const password = randomPassword();
await admin.auth.admin.updateUserById(userId, { password });
// then signInWithPassword with that password
```

This way no committed password gates the route, and the dev needs `ENABLE_DEV_SIGNIN=1` in `.env.local`.

- [ ] **A.3.2: Document in README + commit**

Add note to README: dev sign-in requires `ENABLE_DEV_SIGNIN=1`.

```bash
git add -A
git commit -m "fix(security): harden dev sign-in — env gate + random password"
```

---

### Task A.4: HMAC the OAuth claim parameter

**Files:** new `lib/auth/hmac-claim.ts`, modify `app/auth/callback/route.ts`, modify `components/results/conversion-paths.tsx`

- [ ] **A.4.1: Create signing helpers**

```typescript
// lib/auth/hmac-claim.ts
import "server-only";
import crypto from "crypto";

const SECRET = () => {
  const s = process.env.CLAIM_HMAC_SECRET;
  if (!s) throw new Error("CLAIM_HMAC_SECRET not set");
  return s;
};

export function signClaim(assessmentId: string, expiresAt: number): string {
  const payload = `${assessmentId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", SECRET()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyClaim(token: string): { assessmentId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [assessmentId, expiresStr, sig] = parts;
  if (!assessmentId || !expiresStr || !sig) return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  const expected = crypto.createHmac("sha256", SECRET()).update(`${assessmentId}.${expiresStr}`).digest("base64url");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (!/^[0-9a-f-]{36}$/.test(assessmentId)) return null;
  return { assessmentId };
}
```

- [ ] **A.4.2: Issue signed claim on results page**

In `components/results/conversion-paths.tsx`, replace direct assessment ID with signed token in the OAuth `redirectTo`:

```typescript
// Before:
const redirectTo = `${origin}/auth/callback?claim=${assessmentId}`;

// After: token is fetched from a server endpoint that signs it
// (the page is a client component; create /api/results/sign-claim that returns the token)
```

Add `app/api/results/sign-claim/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { signClaim } from "@/lib/auth/hmac-claim";

export async function POST(req: Request): Promise<Response> {
  const { assessmentId } = await req.json();
  if (!/^[0-9a-f-]{36}$/.test(assessmentId)) return NextResponse.json({ error: "bad id" }, { status: 422 });
  // Optional: verify the requester is the assessment's anonymous owner via session cookie
  const token = signClaim(assessmentId, Date.now() + 24 * 60 * 60 * 1000); // 24h expiry
  return NextResponse.json({ token });
}
```

- [ ] **A.4.3: Verify in callback**

In `app/auth/callback/route.ts`:

```typescript
import { verifyClaim } from "@/lib/auth/hmac-claim";

const claimToken = url.searchParams.get("claim");
if (claimToken) {
  const verified = verifyClaim(claimToken);
  if (!verified) return NextResponse.redirect(`${origin}/assess?error=invalid-claim`);
  const { assessmentId } = verified;
  // proceed with claimAndBootstrapProfile using assessmentId
}
```

- [ ] **A.4.4: Add CLAIM_HMAC_SECRET to env + commit**

Generate a random 64-char hex secret, add to `.env.local` and Vercel env. Document in README.

```bash
git add -A
git commit -m "fix(security): HMAC-sign OAuth claim parameter to prevent CSRF hijack"
```

---

## Phase B — SECURITY HARDENING (P1) — ~3 hours

### Task B.1: Wire Upstash rate limiting

**Files:** new `lib/rate-limit/upstash.ts`, modify `/api/assess`, `/api/leads`, `/api/documents/upload`

- [ ] **B.1.1: Install + wrapper**

```bash
npm install @upstash/ratelimit @upstash/redis
```

Create `lib/rate-limit/upstash.ts`:

```typescript
import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv() : null;

const cache = new Map<string, Ratelimit>();

function ratelimit(name: string, limit: number, window: string): Ratelimit | null {
  if (!redis) return null;
  if (!cache.has(name)) {
    cache.set(name, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `mv:${name}`,
    }));
  }
  return cache.get(name)!;
}

export async function checkRateLimit(name: string, key: string, limit: number, window: string): Promise<boolean> {
  const rl = ratelimit(name, limit, window);
  if (!rl) return true; // no-op when not configured
  const { success } = await rl.limit(key);
  return success;
}

export function ipFromRequest(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
```

- [ ] **B.1.2: Apply to routes**

In `/api/assess`, `/api/leads`, `/api/documents/upload`:

```typescript
import { checkRateLimit, ipFromRequest } from "@/lib/rate-limit/upstash";

export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  if (!await checkRateLimit("assess", ip, 10, "1 m")) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
  // ... rest
}
```

Limits: assess 10/min + 100/day, leads 5/min + 30/day, upload 20/min.

- [ ] **B.1.3: Add env vars + commit**

Document `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in README. Note: rate-limiting becomes a no-op when not configured, so it's safe to commit without provisioning.

```bash
git add -A
git commit -m "feat(security): wire Upstash rate limiting on public endpoints"
```

---

### Task B.2: CSRF on `/auth/signout`

**Files:** `app/auth/signout/route.ts`

- [ ] **B.2.1: Origin/Referer check**

```typescript
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const self = new URL(req.url).origin;
  if (origin !== self && !referer?.startsWith(self)) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }
  // ... existing signout code
}
```

```bash
git add -A
git commit -m "fix(security): add Origin/Referer check to /auth/signout"
```

---

### Task B.3: File upload hardening

**Files:** `app/api/documents/upload/route.ts`

- [ ] **B.3.1: Sanitize filename**

```typescript
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return cleaned || "upload";
}

// Use a UUID for the storage path, store original_name in DB
const safeName = sanitizeFilename(file.name);
const storageName = crypto.randomUUID();
const filePath = `${userId}/${docKind}/${storageName}`;
// Insert: { originalName: safeName, filePath, ... }
```

- [ ] **B.3.2: Magic-byte verification**

```typescript
async function verifyImageMagic(buffer: Buffer, declaredType: string): Promise<boolean> {
  if (buffer.length < 12) return false;
  const head = buffer.subarray(0, 12);
  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return declaredType === "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return declaredType === "image/png";
  // WebP: "RIFF...." then "WEBP"
  if (head.subarray(0,4).toString() === "RIFF" && head.subarray(8,12).toString() === "WEBP") return declaredType === "image/webp";
  return false;
}

// In route, after buffer is built:
if (!await verifyImageMagic(buffer, file.type)) {
  return NextResponse.json({ error: "File is not a valid image" }, { status: 422 });
}
```

- [ ] **B.3.3: Generic error messages**

Replace `Upload failed: ${uploadError.message}` with `Upload failed` + server-side log.

```bash
git add -A
git commit -m "fix(security): sanitize filenames, verify magic bytes, hide raw upload errors"
```

---

### Task B.4: Lazy signed URLs

**Files:** new `app/api/documents/[id]/view/route.ts`, modify `app/(app)/documents/page.tsx`, `components/documents/document-card.tsx`

- [ ] **B.4.1: Per-document view endpoint**

```typescript
// app/api/documents/[id]/view/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSignedDocumentUrl } from "@/lib/documents/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 422 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const { data: doc } = await supabase.from("documents").select("file_path").eq("id", id).eq("owner", user.id).single();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = createSupabaseAdminClient();
  const url = await getSignedDocumentUrl(admin, doc.file_path, 60); // 60-second expiry
  return NextResponse.json({ url });
}
```

- [ ] **B.4.2: Update page + card**

`app/(app)/documents/page.tsx`: drop the parallel `Promise.all` that generates signed URLs. Just pass documents through.

`components/documents/document-card.tsx`: on View click, fetch from `/api/documents/${doc.id}/view`, open the URL in the modal.

- [ ] **B.4.3: Commit**

```bash
git add -A
git commit -m "fix(security): lazy signed URLs — fetch on click, 60s expiry"
```

---

## Phase C — CASCADE + ERRORS (P1) — ~2 hours

### Task C.1: Rebuild full AssessmentPayload in re-score

**Files:** `lib/assessments/re-score.ts`

- [ ] **C.1.1: Use assembleAssessment**

```typescript
import { assembleAssessment } from "@/lib/results/assemble";

export async function reScoreAssessment(db: DB, userId: string): Promise<void> {
  const [profileRow, primaryRow] = await Promise.all([
    getProfile(db, userId),
    getPrimaryAssessmentForUser(db, userId),
  ]);
  if (!profileRow || !primaryRow) return;

  const sections = (profileRow.sections as ProfileSections | undefined) ?? {};
  const studentProfile = sectionsToStudentProfile(sections);
  const freshPayload = assembleAssessment(studentProfile, new Date());

  await db
    .from("assessments")
    .update({ result: freshPayload as unknown as Json })
    .eq("id", primaryRow.id)
    .eq("owner", userId);
}
```

This rebuilds matches + intake + accuracy too. Drop the partial-merge logic.

```bash
git add -A
git commit -m "fix(cascade): re-score rebuilds full AssessmentPayload, not just result"
```

---

### Task C.2: Surface silent errors

**Files:** `app/api/assess/route.ts`, `app/api/profile/section/route.ts`

- [ ] **C.2.1: `/api/assess`**

Replace `catch { id = null }` with:

```typescript
} catch (err) {
  console.error("[/api/assess] persist failed", err);
  if (user) {
    // authenticated user expects persistence — fail loud
    return NextResponse.json({ error: "Failed to save assessment" }, { status: 500 });
  }
  id = null; // anonymous: degrade gracefully
}
```

- [ ] **C.2.2: `/api/profile/section`**

Check whether the patch actually updated a row in `lib/profiles/repo.ts`:

```typescript
export async function patchProfileSection<K extends SectionKey>(...) {
  // ... existing code, but check the response
  const { data, error } = await db
    .from("profiles")
    .update({ sections: next as unknown as Json, completeness: pct })
    .eq("owner", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    // No profile row yet — upsert one
    await upsertProfile(db, { owner: userId, sections: next, completeness: pct });
  }
  return { completeness: pct, sections: next };
}
```

- [ ] **C.2.3: Surface cascade errors with console.error (Sentry later)**

```typescript
try {
  await invalidatePlan(admin, data.user.id);
} catch (err) {
  console.error("[profile/section] invalidatePlan failed", err);
}
try {
  await reScoreAssessment(admin, data.user.id);
} catch (err) {
  console.error("[profile/section] reScoreAssessment failed", err);
}
```

```bash
git add -A
git commit -m "fix(errors): surface silent failures in assess + profile/section routes"
```

---

### Task C.3: Per-page auth + preserve redirect

**Files:** `app/(app)/layout.tsx`, every page under `app/(app)/`

- [ ] **C.3.1: Layout reads headers for path**

```typescript
// app/(app)/layout.tsx
import { headers } from "next/headers";

const h = await headers();
const pathname = h.get("x-pathname") ?? "/dashboard";
if (!user) redirect(`/auth?next=${encodeURIComponent(pathname)}`);
```

Configure middleware to set `x-pathname`:

```typescript
// middleware.ts
response.headers.set("x-pathname", request.nextUrl.pathname);
```

- [ ] **C.3.2: Per-page guards**

In each page under `app/(app)/`, replace `user!` with an explicit check:

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/auth");
```

```bash
git add -A
git commit -m "fix(auth): preserve next path through sign-in + per-page guards"
```

---

## Phase D — UX POLISH (P2) — ~2 hours

### Task D.1: Stale Phase 4/5 copy

**Files:** `app/(app)/checklist/page.tsx`, `app/(app)/matches/page.tsx`

- [ ] **D.1.1: Redirect /checklist to /documents**

```typescript
// app/(app)/checklist/page.tsx
import { redirect } from "next/navigation";
export default function ChecklistPage() { redirect("/documents"); }
```

- [ ] **D.1.2: Replace stale Phase 4 panels**

In `app/(app)/matches/page.tsx`, replace:

```typescript
const scholarshipsPanel = (
  <p className="text-[15px] text-ink-soft">
    Scholarship matching lands in Phase 4 alongside the plan.
  </p>
);
```

With:

```typescript
const scholarshipsPanel = (
  <p className="text-[15px] text-ink-soft">
    Scholarship matching is coming next. We&apos;ll surface scholarships you may qualify for
    based on your destination, field, and grade.
  </p>
);
```

Same for cost estimate. Or remove the tabs entirely if neither is close to shipping.

```bash
git add -A
git commit -m "fix(copy): remove stale Phase 4/5 references, redirect /checklist"
```

---

### Task D.2: humanize() helper for enum display

**Files:** new `lib/text/humanize.ts`

- [ ] **D.2.1: Create helper**

```typescript
// lib/text/humanize.ts
const LABELS: Record<string, string> = {
  // Destinations
  "australia": "Australia", "canada": "Canada", "uk": "United Kingdom",
  "germany": "Germany", "usa": "United States", "ireland": "Ireland", "not-sure": "Not sure yet",
  // Education levels
  "higher-secondary": "+2 / Higher Secondary", "bachelors": "Bachelor's", "masters": "Master's",
  // Fields of study
  "computer-science": "Computer Science", "business": "Business", "nursing": "Nursing",
  "engineering": "Engineering", "hospitality": "Hospitality", "accounting": "Accounting",
  "data-science": "Data Science", "education": "Education", "agriculture": "Agriculture",
  "law": "Law", "arts": "Arts", "other": "Other",
  // Funding sources
  "self-funded": "Self-funded", "parents-family": "Parents/family",
  "education-loan": "Education loan", "mixed": "Mixed sources",
  "scholarship-dependent": "Scholarship-dependent",
  // Goals
  "permanent-residency": "Permanent residency", "lowest-cost": "Lowest cost",
  "highest-ranked": "Highest-ranked program", "fastest-admission": "Fastest admission",
  "best-employment": "Best employment outcome", "research": "Research career",
  // Gap reasons
  "worked": "Worked", "retook-exams": "Retook exams", "health-family": "Health/family",
  "started-something": "Started something", "preparing": "Preparing for studies",
  // Currencies
  "NPR": "NPR", "USD": "USD", "AUD": "AUD", "INR": "INR", "BDT": "BDT", "PKR": "PKR", "NGN": "NGN",
};

export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] ?? value.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
```

- [ ] **D.2.2: Apply to all section summaries**

Use `humanize()` in:
- `components/profile/section-accordion.tsx` (section summary text)
- `app/(focused)/assess/page.tsx` (the "active assessment for X" text)
- Match cards if they display destinations/fields
- Anywhere enum values currently render raw

```bash
git add -A
git commit -m "fix(ux): humanize() helper + apply across profile + assess + matches"
```

---

### Task D.3: Dashboard label + percentages

**Files:** `app/(app)/dashboard/page.tsx`, `components/dashboard/stats-row.tsx`

- [ ] **D.3.1: Rename `checklistDone` → `documents`**

In `StatsRow` props and JSX:

```typescript
{documents != null && (
  <Link href="/documents" className="...">
    <span>Documents</span>
    <span>{documents}</span>
  </Link>
)}
```

- [ ] **D.3.2: Banded language for dimension scores**

In `FactorBars`, replace `{value}/100` with:

```typescript
function band(v: number): string {
  if (v >= 75) return "Strong";
  if (v >= 50) return "Solid";
  if (v >= 25) return "Building";
  return "Needs work";
}
```

Keep the bar visual; replace the numeric label with the band word. Same treatment for profile completeness percentage on `/profile`.

```bash
git add -A
git commit -m "fix(ux): rename Documents stat + banded language replaces percentages"
```

---

### Task D.4: Marketing page content

**Files:** `app/(marketing)/how/page.tsx`, `app/(marketing)/trust/page.tsx`

- [ ] **D.4.1: Write real `/how` content**

3-4 sections explaining: (1) where the data comes from (DHA, university handbooks, official rules), (2) how the four scoring dimensions work, (3) how matches are computed, (4) what changes when you upload documents. ~400 words total. Link to the rule sources.

- [ ] **D.4.2: Write real `/trust` content**

Cover: no agents, no hidden fees, no upsells, our funding model (eventual paid features), what data we store, when we delete it, who has access. ~400 words.

```bash
git add -A
git commit -m "fix(marketing): real content for /how and /trust"
```

---

### Task D.5: Redirect signed-in users from `/`

**Files:** `app/(marketing)/page.tsx`

- [ ] **D.5.1: Server-side redirect**

```typescript
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  // ... existing marketing landing JSX
}
```

```bash
git add -A
git commit -m "fix(ux): redirect signed-in users from marketing / to /dashboard"
```

---

## Phase E — SPEC + DX (P3 + P4) — ~3 hours

### Task E.1: Spec hygiene — Phase 5 supersede notice

**Files:** `docs/superpowers/specs/2026-06-04-phase-5-documents-and-ocr-design.md`

- [ ] **E.1.1: Add banner + section markers**

At top of the spec, add:

```markdown
> **⚠️ SUPERSEDED — see 2026-06-05 vault rip-out.** OCR was removed during implementation; users upload documents manually. Sections 6 (pipeline), 6.3 (parser registry), 6.4 (profile mapping), 6.5–6.7, 7.4 (conflict resolution), 8.3 (extracted state), 9 (OCR errors), 10 (Phase 5B), 12 (test layers 1–3), 13 (Phase 5A OCR deliverables), and 14 (deps) are historical only.
```

Add an inline `> ❌ Superseded` marker before each affected section.

```bash
git add -A
git commit -m "docs: supersede Phase 5 OCR sections after vault rip-out"
```

---

### Task E.2: Write missing Phase 4 spec

**Files:** `docs/superpowers/specs/2026-06-04-phase-4-plan-generator-design.md`

- [ ] **E.2.1: Reverse-engineer + document**

Read `lib/plan/generator.ts`, `lib/plan/invalidate.ts`, `lib/plan/repo.ts`, `app/(app)/plan/page.tsx`, the migration. Write a retroactive spec covering: 11 rules, plan_items schema, partial unique index, status enum, `/api/plan/action` endpoint, dashboard integration.

```bash
git add -A
git commit -m "docs: write retroactive Phase 4 plan-generator spec"
```

---

### Task E.3: Regenerate Supabase types + drop `as any`

**Files:** `lib/supabase/types.ts`, `lib/documents/repo.ts`, `app/(app)/documents/page.tsx`

- [ ] **E.3.1: Regenerate**

```bash
npx supabase gen types typescript --project-id obfvrxixtautamflzxzq > lib/supabase/types.ts
```

- [ ] **E.3.2: Drop casts**

In `lib/documents/repo.ts`, remove `as unknown as DocumentRow[]` chains. In `app/(app)/documents/page.tsx`, remove `as any`. Type-check after each.

```bash
git add -A
git commit -m "fix(types): regenerate Supabase types, drop unsafe casts"
```

---

### Task E.4: Next.js security headers

**Files:** `next.config.ts`

- [ ] **E.4.1: Add headers block**

```typescript
const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};
```

CSP can be added later — it requires knowing all script/style sources.

```bash
git add -A
git commit -m "fix(security): add Next.js security headers"
```

---

### Task E.5: Test cleanup

**Files:** `tests/documents/repo.test.ts`, new `tests/api/documents-upload.test.ts`, new `tests/api/documents-delete.test.ts`

- [ ] **E.5.1: Remove stale fields from existing tests**

In `tests/documents/repo.test.ts`, remove `status: "extracted"`, `extracted_data: null`, `profile_section: "english"` from fixtures — those columns no longer exist.

- [ ] **E.5.2: Add upload route integration test**

Cover: validation branches (size, mime, kind), boolean flag flip, error returns. Use mocked Supabase client.

- [ ] **E.5.3: Add delete route integration test**

Cover: ownership check, file removal, flag reversal only when no other docs in group.

```bash
git add -A
git commit -m "test: clean stale fixtures + add upload/delete route tests"
```

---

### Task E.6: AppBar nav reconciliation

**Files:** `components/layout/app-bar.tsx`, marketing+1.5 specs

- [ ] **E.6.1: Decide on canonical app nav**

Options:
- Keep all 7 items (Home, Matches, My plan, Profile, Documents, Guide, Destinations)
- Remove Destinations from app nav (it's primarily a marketing concept)
- Move Guide and Destinations to a "More" dropdown

Pick option, update `NAV_APP` accordingly, update specs in `2026-06-04-marketing-and-shell-design.md` §3.2 and `2026-06-04-phase-1-5-signed-in-shell-design.md` §3.2.

```bash
git add -A
git commit -m "fix(nav): reconcile AppBar with specs; remove Destinations from app nav"
```

---

## Acceptance — definition of done

After all phases:

- [ ] **Tests:** Full suite passes (current 403 + new tests for upload/delete/enum roundtrip = ~420+)
- [ ] **Typecheck:** Clean
- [ ] **Build:** Clean
- [ ] **Lint:** No new errors (existing claudedesign/ errors are pre-existing)
- [ ] **Browser smoke:**
  - Sign in via `ENABLE_DEV_SIGNIN=1` + `/api/dev/sign-in`
  - Dashboard shows banded language (not 53/100)
  - Profile section summaries show humanized text (not raw enums)
  - Edit profile sections → dashboard verdict updates + matches refresh
  - Upload document → boolean flag flips → "Add proof of funds" plan item disappears
  - Click View on uploaded doc → modal opens with image
  - Delete doc → flag reverses only if no other doc in group
  - Visit `/checklist` → redirected to `/documents`
  - `/matches` Scholarships/Cost tabs don't say "Phase 4"
  - Signed in, visit `/` → redirected to `/dashboard`
- [ ] **Security:**
  - Dev sign-in 404s in production
  - Cannot insert documents row with someone else's owner via browser anon client
  - `/auth/callback` rejects unsigned `claim` param
  - `/auth/signout` rejects cross-origin POST
  - Upload rejects non-image magic bytes
- [ ] **Spec hygiene:** Phase 5 has supersede notice. Phase 4 spec exists.

---

## Execution recommendation

Run via **subagent-driven-development**: dispatch one subagent per task in order. Phase A is data-corrupting and must ship before any user signs in. Phases B–E are independently shippable batches.

**Rough order if you can only do some:**
1. Phase A (all 4 tasks) — non-negotiable
2. Phase C.1 (re-score full payload) — depends on Phase A
3. Phase B.1 (rate limiting) — protects what's already live
4. Phase D.1 + D.5 (stale copy + redirect) — fast user-visible wins
5. Everything else in any order
