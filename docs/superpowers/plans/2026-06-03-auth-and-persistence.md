# Plan 3: Auth & Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three-tier conversion real — Google accounts, server-side assessment persistence, claim-on-signup, and owner-only re-open — building on the validated Supabase schema.

**Architecture:** A completed wizard run is persisted as an anonymous `assessments` row (service-role write) and returned with its id. "Continue with Google" runs Supabase OAuth with the id in the `redirectTo`; the callback route exchanges the code and claims the row to the user, then redirects to an owner-only `/assessment/[id]` page that renders the saved results unlocked. All DB writes are server-side via the service role; RLS exposes only owner-scoped reads.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Zod, Vitest + @testing-library.

---

## Background the engineer needs

- **Design spec:** `docs/superpowers/specs/2026-06-03-auth-and-persistence-design.md`. Read §4–5 (lifecycle, schema/RLS) before starting.
- **The schema already exists on the remote Merovisa project** (validated + hardened during design). This plan version-controls it and writes the app code. Do **not** re-apply or `db push` the migration.
- **Persistence shape:** the `assessments.result` jsonb stores the **full `AssessmentPayload`** (what `/api/assess` returns), so re-open renders exactly what the user saw. `profile` is stored separately for future re-run. `rule_version` mirrors `payload.result.ruleVersion`.
- **Accounts are Google-only.** Email is Tier-2 lead capture only (no send). Unlock reveals full matches; deep teasers become "coming soon."
- **Existing Supabase clients:** `lib/supabase/client.ts` (`createSupabaseBrowserClient`), `lib/supabase/server.ts` (`createSupabaseServerClient`, async). Keep both.
- **Run a single test:** `npm test -- <path>`. Full gate: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- **`@/*` maps to repo root. Named exports, kebab-case files, PascalCase components.**

---

## File Structure

```
supabase/config.toml                          NEW — CLI project config
supabase/migrations/<ts>_init_assessments_and_leads.sql   NEW — version-control the hardened schema
lib/supabase/types.ts                          REPLACE — generated Database types
lib/supabase/admin.ts                          NEW — service-role client (lazy, server-only)
lib/supabase/middleware.ts                     NEW — @supabase/ssr session-refresh helper
middleware.ts                                  NEW — wires the helper
lib/assessments/expiry.ts                      NEW — 3-day TTL helpers (pure)
lib/assessments/repo.ts                        NEW — typed data access over a Supabase client
lib/validation/lead.ts                         NEW — Zod schema for lead capture
tests/helpers/fake-supabase.ts                 NEW — chainable Supabase stub for repo tests
app/api/assess/route.ts                        MODIFY — persist anon row, return { id, payload }
app/api/leads/route.ts                         NEW — lead capture endpoint
app/auth/callback/route.ts                     NEW — exchange code → claim → redirect
app/auth/signout/route.ts                      NEW — sign out
app/assessment/[id]/page.tsx                   NEW — owner-only read, Results in "owned" mode
components/results/results.tsx                 MODIFY — mode: "anonymous" | "owned" + assessmentId
components/results/university-matches.tsx      MODIFY — unlocked prop (full list)
components/results/gated-teasers.tsx           MODIFY — unlocked prop ("coming soon")
components/results/conversion-paths.tsx        MODIFY — Google OAuth + POST /api/leads
components/assess/assess-flow.tsx              MODIFY — carry assessment id into Results
```

---

## Task 1: Supabase scaffolding — CLI init, migration file, types, admin client

**Files:**
- Create: `supabase/config.toml` (via CLI)
- Create: `supabase/migrations/<timestamp>_init_assessments_and_leads.sql`
- Replace: `lib/supabase/types.ts`
- Create: `lib/supabase/admin.ts`
- Create: `tests/supabase/admin.test.ts`

- [ ] **Step 1: Initialise the Supabase CLI project and a migration file**

```bash
npx supabase init
npx supabase migration new init_assessments_and_leads
```

`supabase init` writes `supabase/config.toml`. `migration new` creates an empty `supabase/migrations/<timestamp>_init_assessments_and_leads.sql`. Paste exactly this into that file (it matches the live, hardened schema — do NOT run `db push`, the remote already has it):

```sql
create table public.assessments (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid references auth.users(id) on delete cascade,
  profile      jsonb       not null,
  result       jsonb       not null,
  rule_version text        not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  claimed_at   timestamptz
);
create index assessments_owner_idx on public.assessments (owner) where owner is not null;

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid references public.assessments(id) on delete cascade,
  email         text        not null,
  consent_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint leads_assessment_email_uniq unique (assessment_id, email)
);
create index leads_assessment_id_idx on public.leads (assessment_id);

alter table public.assessments enable row level security;
alter table public.leads        enable row level security;
alter table public.assessments force row level security;
alter table public.leads        force row level security;

create policy assessments_select_own
  on public.assessments
  for select
  to authenticated
  using ((select auth.uid()) = owner);

revoke all on public.assessments from anon;
revoke all on public.assessments from authenticated;
grant  select on public.assessments to authenticated;
revoke all on public.leads from anon, authenticated;
```

- [ ] **Step 2: Replace the placeholder DB types**

Replace the entire contents of `lib/supabase/types.ts` with the generated types (the `assessments` + `leads` schema). Generate them with the Supabase MCP `generate_typescript_types` (project `obfvrxixtautamflzxzq`) or `npx supabase gen types typescript --linked`. The result begins:

```ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      assessments: {
        Row: {
          claimed_at: string | null
          created_at: string
          expires_at: string
          id: string
          owner: string | null
          profile: Json
          result: Json
          rule_version: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          owner?: string | null
          profile: Json
          result: Json
          rule_version: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          owner?: string | null
          profile?: Json
          result?: Json
          rule_version?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assessment_id: string | null
          consent_at: string
          created_at: string
          email: string
          id: string
        }
        Insert: {
          assessment_id?: string | null
          consent_at?: string
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          assessment_id?: string | null
          consent_at?: string
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
```

(Keep the full generated file including the `Tables<>`, `TablesInsert<>`, etc. helper exports and `Constants` that the generator appends.)

- [ ] **Step 3: Write the failing test for the admin client**

```ts
// tests/supabase/admin.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createClient = vi.fn(() => ({ tag: "admin-client" }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

describe("createSupabaseAdminClient", () => {
  const OLD = process.env;
  beforeEach(() => {
    process.env = { ...OLD };
    createClient.mockClear();
  });
  afterEach(() => {
    process.env = OLD;
  });

  it("throws when env vars are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createSupabaseAdminClient()).toThrow(/service/i);
  });

  it("builds a client with the service-role key and no session persistence", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const client = createSupabaseAdminClient();
    expect(client).toEqual({ tag: "admin-client" });
    expect(createClient).toHaveBeenCalledWith(
      "https://x.supabase.co",
      "service-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
});
```

- [ ] **Step 4: Run it and confirm failure**

Run: `npm test -- tests/supabase/admin.test.ts`
Expected: FAIL — `@/lib/supabase/admin` unresolved.

- [ ] **Step 5: Implement the admin client**

```ts
// lib/supabase/admin.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Service-role client for privileged, server-only writes (anonymous insert, claim,
// lead capture). Never import this into a client component or a NEXT_PUBLIC_ context.
// Built lazily so importing the module never throws at load time (keeps tests clean).
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

> The test mocks `@supabase/supabase-js`, so `"server-only"` must also be mocked-safe. If the test fails importing `server-only`, add `vi.mock("server-only", () => ({}))` at the top of the test file.

- [ ] **Step 6: Run it and confirm pass**

Run: `npm test -- tests/supabase/admin.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add supabase lib/supabase/types.ts lib/supabase/admin.ts tests/supabase/admin.test.ts
git commit -m "feat: supabase scaffolding — migration, generated types, admin client"
```

---

## Task 2: Assessment expiry helpers

**Files:**
- Create: `lib/assessments/expiry.ts`
- Create: `tests/assessments/expiry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/assessments/expiry.test.ts
import { describe, it, expect } from "vitest";
import { ASSESSMENT_TTL_DAYS, assessmentExpiry, isExpired } from "@/lib/assessments/expiry";

describe("assessment expiry", () => {
  const now = new Date("2026-06-03T00:00:00.000Z");

  it("is a 3-day window", () => {
    expect(ASSESSMENT_TTL_DAYS).toBe(3);
  });

  it("computes expiry 3 days out as an ISO string", () => {
    expect(assessmentExpiry(now)).toBe("2026-06-06T00:00:00.000Z");
  });

  it("detects expiry relative to now", () => {
    expect(isExpired("2026-06-02T00:00:00.000Z", now)).toBe(true);
    expect(isExpired("2026-06-04T00:00:00.000Z", now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/assessments/expiry.test.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```ts
// lib/assessments/expiry.ts
export const ASSESSMENT_TTL_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function assessmentExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + ASSESSMENT_TTL_DAYS * MS_PER_DAY).toISOString();
}

export function isExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/assessments/expiry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/assessments/expiry.ts tests/assessments/expiry.test.ts
git commit -m "feat: add assessment expiry helpers"
```

---

## Task 3: Lead validation schema

**Files:**
- Create: `lib/validation/lead.ts`
- Create: `tests/validation/lead.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/validation/lead.test.ts
import { describe, it, expect } from "vitest";
import { LeadSchema } from "@/lib/validation/lead";

describe("LeadSchema", () => {
  it("accepts a valid email + assessment uuid", () => {
    const r = LeadSchema.safeParse({
      email: "student@example.com",
      assessmentId: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bad email", () => {
    expect(LeadSchema.safeParse({ email: "nope", assessmentId: "11111111-1111-1111-1111-111111111111" }).success).toBe(false);
  });

  it("rejects a non-uuid assessmentId", () => {
    expect(LeadSchema.safeParse({ email: "a@b.com", assessmentId: "x" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/validation/lead.test.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```ts
// lib/validation/lead.ts
import { z } from "zod";

export const LeadSchema = z.object({
  email: z.string().email(),
  assessmentId: z.string().uuid(),
});

export type LeadInput = z.infer<typeof LeadSchema>;
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/validation/lead.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validation/lead.ts tests/validation/lead.test.ts
git commit -m "feat: add lead capture validation schema"
```

---

## Task 4: Assessments repo — fake Supabase + write functions

**Files:**
- Create: `tests/helpers/fake-supabase.ts`
- Create: `lib/assessments/repo.ts`
- Create: `tests/assessments/repo-writes.test.ts`

- [ ] **Step 1: Write the chainable Supabase stub**

```ts
// tests/helpers/fake-supabase.ts
import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type FakeResult = { data: unknown; error: unknown };

// PostgREST query builders are chainable AND awaitable (thenable). This stub returns
// itself for every chain method and resolves to `result` when awaited or when a
// terminal (.single/.maybeSingle) is called. `calls` records (method, args) for asserts.
export function fakeSupabase(result: FakeResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  for (const m of ["insert", "update", "upsert", "select", "eq", "is", "gt"]) {
    builder[m] = record(m);
  }
  builder.single = vi.fn(() => {
    calls.push({ method: "single", args: [] });
    return Promise.resolve(result);
  });
  builder.maybeSingle = vi.fn(() => {
    calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(result);
  });
  builder.then = (resolve: (r: FakeResult) => unknown) => resolve(result);

  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return builder;
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, calls };
}
```

- [ ] **Step 2: Write the failing test for the write functions**

```ts
// tests/assessments/repo-writes.test.ts
import { describe, it, expect } from "vitest";
import { createAnonymousAssessment, createLead } from "@/lib/assessments/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("createAnonymousAssessment", () => {
  it("inserts a row and returns the new id", async () => {
    const { client, calls } = fakeSupabase({ data: { id: "new-id" }, error: null });
    const id = await createAnonymousAssessment(client, {
      profile: { homeCountry: "Nepal" },
      result: { result: { verdict: "possible" } },
      ruleVersion: "v0.1.0",
      expiresAt: "2026-06-06T00:00:00.000Z",
    });
    expect(id).toBe("new-id");
    expect(calls[0]).toEqual({ method: "from", args: ["assessments"] });
    expect(calls.some((c) => c.method === "insert")).toBe(true);
  });

  it("returns null when the insert errors", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    const id = await createAnonymousAssessment(client, {
      profile: {},
      result: {},
      ruleVersion: "v0.1.0",
      expiresAt: "2026-06-06T00:00:00.000Z",
    });
    expect(id).toBeNull();
  });
});

describe("createLead", () => {
  it("upserts on the (assessment_id, email) conflict target, ignoring duplicates", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await createLead(client, { email: "a@b.com", assessmentId: "aid" });
    expect(calls[0]).toEqual({ method: "from", args: ["leads"] });
    const upsert = calls.find((c) => c.method === "upsert");
    expect(upsert?.args[1]).toEqual({ onConflict: "assessment_id,email", ignoreDuplicates: true });
  });
});
```

- [ ] **Step 3: Run it and confirm failure**

Run: `npm test -- tests/assessments/repo-writes.test.ts`
Expected: FAIL — `@/lib/assessments/repo` unresolved.

- [ ] **Step 4: Implement the write functions**

```ts
// lib/assessments/repo.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;
export type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];

export interface NewAssessment {
  profile: Json;
  result: Json;
  ruleVersion: string;
  expiresAt: string;
}

export async function createAnonymousAssessment(db: DB, input: NewAssessment): Promise<string | null> {
  const { data, error } = await db
    .from("assessments")
    .insert({
      owner: null,
      profile: input.profile,
      result: input.result,
      rule_version: input.ruleVersion,
      expires_at: input.expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function createLead(db: DB, input: { email: string; assessmentId: string }): Promise<void> {
  await db
    .from("leads")
    .upsert(
      { email: input.email, assessment_id: input.assessmentId },
      { onConflict: "assessment_id,email", ignoreDuplicates: true },
    );
}
```

- [ ] **Step 5: Run it and confirm pass**

Run: `npm test -- tests/assessments/repo-writes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/fake-supabase.ts lib/assessments/repo.ts tests/assessments/repo-writes.test.ts
git commit -m "feat: add assessments repo writes (create anon assessment, create lead)"
```

---

## Task 5: Assessments repo — claim + owner read

**Files:**
- Modify: `lib/assessments/repo.ts`
- Create: `tests/assessments/repo-claim.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/assessments/repo-claim.test.ts
import { describe, it, expect } from "vitest";
import { claimAssessment, getOwnedAssessment } from "@/lib/assessments/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("claimAssessment", () => {
  it("claims only an unowned, unexpired row and reports success", async () => {
    const { client, calls } = fakeSupabase({ data: [{ id: "aid" }], error: null });
    const claimed = await claimAssessment(client, {
      id: "aid",
      userId: "user-1",
      nowIso: "2026-06-03T00:00:00.000Z",
    });
    expect(claimed).toBe(true);
    expect(calls.some((c) => c.method === "update")).toBe(true);
    expect(calls.some((c) => c.method === "is" && c.args[0] === "owner" && c.args[1] === null)).toBe(true);
    expect(calls.some((c) => c.method === "gt" && c.args[0] === "expires_at")).toBe(true);
  });

  it("reports failure when no row matched (already claimed or expired)", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    const claimed = await claimAssessment(client, { id: "aid", userId: "u", nowIso: "2026-06-03T00:00:00.000Z" });
    expect(claimed).toBe(false);
  });
});

describe("getOwnedAssessment", () => {
  it("returns the row when RLS allows it", async () => {
    const row = { id: "aid", owner: "user-1", result: { result: { verdict: "possible" } } };
    const { client } = fakeSupabase({ data: row, error: null });
    const got = await getOwnedAssessment(client, "aid");
    expect(got).toEqual(row);
  });

  it("returns null when not found / not owner", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getOwnedAssessment(client, "aid")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/assessments/repo-claim.test.ts`
Expected: FAIL — `claimAssessment` / `getOwnedAssessment` not exported.

- [ ] **Step 3: Add the functions to `lib/assessments/repo.ts`**

Append to the existing file:

```ts
export async function claimAssessment(
  db: DB,
  input: { id: string; userId: string; nowIso: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("assessments")
    .update({ owner: input.userId, claimed_at: new Date().toISOString() })
    .eq("id", input.id)
    .is("owner", null)
    .gt("expires_at", input.nowIso)
    .select("id");
  if (error || !data) return false;
  return data.length > 0;
}

export async function getOwnedAssessment(db: DB, id: string): Promise<AssessmentRow | null> {
  const { data, error } = await db.from("assessments").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data;
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/assessments/repo-claim.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/assessments/repo.ts tests/assessments/repo-claim.test.ts
git commit -m "feat: add assessment claim and owner-read repo functions"
```

---

## Task 6: Persist on `/api/assess`

**Files:**
- Modify: `app/api/assess/route.ts`
- Create: `tests/api/assess-persist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/assess-persist.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createAnonymousAssessment = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/repo", () => ({ createAnonymousAssessment }));

import { POST } from "@/app/api/assess/route";

const validProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear() - 1,
  gapReasons: ["worked"],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

const req = (body: unknown) =>
  new Request("http://localhost/api/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/assess (persistence)", () => {
  beforeEach(() => createAnonymousAssessment.mockReset());

  it("persists the assessment and returns its id alongside the payload", async () => {
    createAnonymousAssessment.mockResolvedValue("assessment-123");
    const res = await POST(req(validProfile));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("assessment-123");
    expect(json.payload.result.verdict).toBeDefined();
    expect(json.payload.matchedCount).toBeGreaterThan(0);
  });

  it("still returns the payload with id:null when persistence fails", async () => {
    createAnonymousAssessment.mockResolvedValue(null);
    const res = await POST(req(validProfile));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBeNull();
    expect(json.payload.result.verdict).toBeDefined();
  });

  it("returns 422 for an invalid profile (no persistence attempted)", async () => {
    const res = await POST(req({ ...validProfile, grade: 999 }));
    expect(res.status).toBe(422);
    expect(createAnonymousAssessment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/api/assess-persist.test.ts`
Expected: FAIL — response has no `id` (route still returns the bare payload).

- [ ] **Step 3: Update the route**

```ts
// app/api/assess/route.ts
import { NextResponse } from "next/server";
import { ProfileSchema } from "@/lib/validation/profile";
import { assembleAssessment } from "@/lib/results/assemble";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAnonymousAssessment } from "@/lib/assessments/repo";
import { assessmentExpiry } from "@/lib/assessments/expiry";
import type { Json } from "@/lib/supabase/types";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const payload = assembleAssessment(parsed.data);

  // Persist anonymously so the assessment survives the OAuth redirect and can be
  // claimed on signup. A failed write must never block the user from seeing results.
  let id: string | null = null;
  try {
    id = await createAnonymousAssessment(createSupabaseAdminClient(), {
      profile: parsed.data as unknown as Json,
      result: payload as unknown as Json,
      ruleVersion: payload.result.ruleVersion,
      expiresAt: assessmentExpiry(),
    });
  } catch {
    id = null;
  }

  return NextResponse.json({ id, payload }, { status: 200 });
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/api/assess-persist.test.ts`
Expected: PASS (3 tests).

> Note: the Plan-2 test `tests/api/assess.test.ts` asserted the old shape (`json.result.verdict`). Update those two assertions to `json.payload.result.verdict` and `json.payload.matchedCount` so they match the new envelope, and keep the 422/400 cases.

- [ ] **Step 5: Run the updated Plan-2 route test**

Run: `npm test -- tests/api/assess.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/assess/route.ts tests/api/assess-persist.test.ts tests/api/assess.test.ts
git commit -m "feat: persist anonymous assessment on /api/assess, return { id, payload }"
```

---

## Task 7: Lead capture endpoint `/api/leads`

**Files:**
- Create: `app/api/leads/route.ts`
- Create: `tests/api/leads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/leads.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createLead = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/repo", () => ({ createLead }));

import { POST } from "@/app/api/leads/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/leads", () => {
  beforeEach(() => createLead.mockReset());

  it("captures a valid lead and returns 200", async () => {
    createLead.mockResolvedValue(undefined);
    const res = await POST(req({ email: "a@b.com", assessmentId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(200);
    expect(createLead).toHaveBeenCalledWith(
      { tag: "admin" },
      { email: "a@b.com", assessmentId: "11111111-1111-1111-1111-111111111111" },
    );
  });

  it("returns 422 for an invalid body", async () => {
    const res = await POST(req({ email: "nope", assessmentId: "x" }));
    expect(res.status).toBe(422);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await POST(new Request("http://localhost/api/leads", { method: "POST", body: "{bad" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/api/leads.test.ts`
Expected: FAIL — route unresolved.

- [ ] **Step 3: Implement**

```ts
// app/api/leads/route.ts
import { NextResponse } from "next/server";
import { LeadSchema } from "@/lib/validation/lead";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLead } from "@/lib/assessments/repo";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  try {
    await createLead(createSupabaseAdminClient(), parsed.data);
  } catch {
    return NextResponse.json({ error: "Could not save lead" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/api/leads.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/leads/route.ts tests/api/leads.test.ts
git commit -m "feat: add /api/leads lead-capture endpoint"
```

---

## Task 8: Session middleware

**Files:**
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`

> No unit test: middleware wraps `@supabase/ssr` and Next internals that need a runtime request/response. It is exercised by the auth flow end-to-end. Verify by `npm run build` (the matcher and types must compile) and the manual check in Task 14.

- [ ] **Step 1: Implement the session-refresh helper**

```ts
// lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Touch the user to refresh the session cookie if needed. Do not gate routes here.
  await supabase.auth.getUser();
  return response;
}
```

- [ ] **Step 2: Wire the middleware**

```ts
// middleware.ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, `middleware` is picked up (no type errors).

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/middleware.ts middleware.ts
git commit -m "feat: add Supabase session-refresh middleware"
```

---

## Task 9: OAuth callback — exchange code, claim, redirect

**Files:**
- Create: `app/auth/callback/route.ts`
- Create: `tests/api/auth-callback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/auth-callback.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const claimAssessment = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession, getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/repo", () => ({ claimAssessment }));

import { GET } from "@/app/auth/callback/route";

const url = (qs: string) => new Request(`http://localhost/auth/callback?${qs}`);

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
    claimAssessment.mockReset();
  });

  it("exchanges the code, claims the assessment, and redirects to it", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    claimAssessment.mockResolvedValue(true);

    const res = await GET(url("code=abc&claim=aid-1"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(claimAssessment).toHaveBeenCalledWith({ tag: "admin" }, expect.objectContaining({ id: "aid-1", userId: "user-1" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assessment/aid-1");
  });

  it("redirects to /assess with an error flag when the code exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });
    const res = await GET(url("code=bad&claim=aid-1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess");
    expect(res.headers.get("location")).toContain("error=auth");
  });

  it("redirects home when there is no code", async () => {
    const res = await GET(url("claim=aid-1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/api/auth-callback.test.ts`
Expected: FAIL — route unresolved.

- [ ] **Step 3: Implement**

```ts
// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAssessment } from "@/lib/assessments/repo";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const claim = url.searchParams.get("claim");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/assess`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/assess?error=auth`);
  }

  if (claim) {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (userId) {
      await claimAssessment(createSupabaseAdminClient(), {
        id: claim,
        userId,
        nowIso: new Date().toISOString(),
      });
    }
    return NextResponse.redirect(`${origin}/assessment/${claim}`);
  }

  return NextResponse.redirect(`${origin}/`);
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/api/auth-callback.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/auth/callback/route.ts tests/api/auth-callback.test.ts
git commit -m "feat: add OAuth callback that claims the assessment"
```

---

## Task 10: Sign-out route

**Files:**
- Create: `app/auth/signout/route.ts`
- Create: `tests/api/signout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/signout.test.ts
import { describe, it, expect, vi } from "vitest";

const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut } }),
}));

import { POST } from "@/app/auth/signout/route";

describe("POST /auth/signout", () => {
  it("signs out and redirects home", async () => {
    const res = await POST(new Request("http://localhost/auth/signout", { method: "POST" }));
    expect(signOut).toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/api/signout.test.ts`
Expected: FAIL — route unresolved.

- [ ] **Step 3: Implement**

```ts
// app/auth/signout/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/api/signout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/auth/signout/route.ts tests/api/signout.test.ts
git commit -m "feat: add sign-out route"
```

---

## Task 11: Unlock states — UniversityMatches + GatedTeasers + Results mode

**Files:**
- Modify: `components/results/university-matches.tsx`
- Modify: `components/results/gated-teasers.tsx`
- Modify: `components/results/results.tsx`
- Create: `tests/components/unlocked-results.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/unlocked-results.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UniversityMatches } from "@/components/results/university-matches";
import { GatedTeasers } from "@/components/results/gated-teasers";
import type { UniversityMatch } from "@/lib/matching/universities";
import type { UniversityData } from "@/lib/data/types";

function uni(id: string, name: string): UniversityData {
  return {
    id, country: "australia", name, city: "Melbourne", rankingTier: 2,
    fieldsOffered: ["computer-science"], tuitionUsdPerYear: { min: 25000, max: 38000 },
    minGradePercent: 65, minEnglishScore: 6.5, source: "https://e.edu", lastVerified: "2026-06-02",
  };
}
const matches: UniversityMatch[] = Array.from({ length: 5 }, (_, i) => ({
  university: uni(`u${i}`, `University ${i}`), matchLevel: "possible", reason: "A realistic target.",
}));

describe("unlocked results", () => {
  it("UniversityMatches: unlocked shows every match and no unlock button", () => {
    render(<UniversityMatches matches={matches} total={5} unlocked onUnlock={vi.fn()} />);
    expect(screen.getByText("University 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unlock all/ })).toBeNull();
  });

  it("UniversityMatches: locked (default) hides the unlock button behind blur", () => {
    render(<UniversityMatches matches={matches} total={12} onUnlock={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Unlock all/ })).toBeInTheDocument();
  });

  it("GatedTeasers: unlocked shows a 'coming soon' note and no blur trigger", () => {
    render(<GatedTeasers unlocked onUnlock={vi.fn()} />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/unlocked-results.test.tsx`
Expected: FAIL — `unlocked` prop not supported.

- [ ] **Step 3: Update `university-matches.tsx`**

Replace the component signature and body so `unlocked` renders the full list with no overlay:

```tsx
// components/results/university-matches.tsx
import type { UniversityMatch } from "@/lib/matching/universities";
import { Button } from "@/components/ui/button";
import { cn, formatUsd } from "@/lib/utils";

const LEVEL_CLS = {
  strong: "bg-strong-tint text-strong",
  possible: "bg-possible-tint text-possible",
  reach: "bg-reach-tint text-reach",
} as const;

const LEVEL_LABEL = {
  strong: "Strong match",
  possible: "Possible",
  reach: "Reach",
} as const;

function MatchCard({ m }: { m: UniversityMatch }) {
  return (
    <article className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink">{m.university.name}</span>
        <span className={cn("rounded-pill px-2.5 py-0.5 font-mono text-[11.5px]", LEVEL_CLS[m.matchLevel])}>
          {LEVEL_LABEL[m.matchLevel]}
        </span>
      </div>
      <p className="mt-1 text-[15px] text-ink-soft">
        {m.university.city} · {formatUsd(m.university.tuitionUsdPerYear.min)}–
        {formatUsd(m.university.tuitionUsdPerYear.max)}/yr
      </p>
      <p className="mt-1 text-[15px] text-ink-soft">{m.reason}</p>
    </article>
  );
}

export function UniversityMatches({
  matches,
  total,
  onUnlock,
  unlocked = false,
}: {
  matches: UniversityMatch[];
  total: number;
  onUnlock: () => void;
  unlocked?: boolean;
}) {
  const free = matches.slice(0, 3);
  const locked = matches.slice(3);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[21px]">University matches</h3>
        <span className="font-mono text-[12.5px] text-ink-faint">{total} matched your profile</span>
      </div>

      {unlocked ? (
        matches.map((m) => <MatchCard key={m.university.id} m={m} />)
      ) : (
        <>
          {free.map((m) => (
            <MatchCard key={m.university.id} m={m} />
          ))}
          {locked.length > 0 ? (
            <div className="relative overflow-hidden rounded-md border border-line bg-surface">
              <div className="flex flex-col gap-3 p-4 blur-[6px] select-none" aria-hidden>
                {locked.slice(0, 3).map((m) => (
                  <div key={m.university.id} className="flex items-center justify-between">
                    <span className="text-ink">{m.university.name}</span>
                    <span className="font-mono text-[11.5px] text-ink-faint">{LEVEL_LABEL[m.matchLevel]}</span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 grid place-items-center bg-surface/60">
                <Button onClick={onUnlock}>Unlock all {total} matches →</Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Update `gated-teasers.tsx`**

```tsx
// components/results/gated-teasers.tsx
const TEASERS = [
  {
    title: "3 scholarships you may qualify for",
    peek: "Australia Awards Scholarship — full tuition + monthly stipend for eligible applicants",
  },
  {
    title: "23-step Australia procedure guide from Nepal",
    peek: "1. Collect academic transcripts  2. Sit IELTS at British Council  3. Shortlist universities",
  },
  {
    title: "14 documents in your checklist",
    peek: "Academic · Financial · Identity · English proficiency · Statement of purpose",
  },
];

export function GatedTeasers({ onUnlock, unlocked = false }: { onUnlock: () => void; unlocked?: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[21px]">Your full roadmap</h3>
      {unlocked
        ? TEASERS.map((t) => (
            <div key={t.title} className="rounded-md border border-line bg-surface p-4">
              <span className="block text-ink">{t.title}</span>
              <span className="mt-1 block text-[15px] text-ink-soft">
                Coming soon — we&apos;re preparing this and will email you when it&apos;s ready.
              </span>
            </div>
          ))
        : TEASERS.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={onUnlock}
              className="overflow-hidden rounded-md border border-line bg-surface p-4 text-left"
            >
              <span className="block text-ink">{t.title}</span>
              <span className="mt-1 block text-[15px] text-ink-soft blur-[4px] select-none" aria-hidden>
                {t.peek}
              </span>
            </button>
          ))}
    </section>
  );
}
```

- [ ] **Step 5: Update `results.tsx` to support a mode**

```tsx
// components/results/results.tsx
"use client";

import { useRef } from "react";
import type { AssessmentPayload } from "@/lib/results/types";
import { VerdictCard } from "./verdict-card";
import { FactorBars } from "./factor-bars";
import { IntakeTimingCard } from "./intake-timing";
import { UniversityMatches } from "./university-matches";
import { GatedTeasers } from "./gated-teasers";
import { AccuracyMeter } from "./accuracy-meter";
import { ConversionPaths } from "./conversion-paths";

export function Results({
  payload,
  mode = "anonymous",
  assessmentId = null,
}: {
  payload: AssessmentPayload;
  mode?: "anonymous" | "owned";
  assessmentId?: string | null;
}) {
  const conversionRef = useRef<HTMLDivElement>(null);
  const scrollToConversion = () =>
    conversionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const owned = mode === "owned";

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-5 py-10">
      <VerdictCard verdict={payload.result.verdict} />
      <FactorBars dimensions={payload.result.dimensions} />
      <IntakeTimingCard intake={payload.intake} />
      <UniversityMatches
        matches={payload.matches}
        total={payload.matchedCount}
        onUnlock={scrollToConversion}
        unlocked={owned}
      />
      <GatedTeasers onUnlock={scrollToConversion} unlocked={owned} />
      <AccuracyMeter accuracy={payload.accuracy} />
      {owned ? null : (
        <div ref={conversionRef}>
          <ConversionPaths assessmentId={assessmentId} />
        </div>
      )}
    </div>
  );
}
```

> `ConversionPaths` now takes `assessmentId` — that prop is added in Task 12. This file will not typecheck until Task 12 lands; run the full typecheck at the end of Task 12, not here.

- [ ] **Step 6: Run the component test**

Run: `npm test -- tests/components/unlocked-results.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add components/results/university-matches.tsx components/results/gated-teasers.tsx components/results/results.tsx tests/components/unlocked-results.test.tsx
git commit -m "feat: add unlocked (owned) rendering for matches, teasers, and results"
```

---

## Task 12: Wire ConversionPaths to Google OAuth + lead capture

**Files:**
- Modify: `components/results/conversion-paths.tsx`
- Modify: `tests/components/conversion-paths.test.tsx` (replace — behavior changed)

- [ ] **Step 1: Replace the conversion-paths test**

```tsx
// tests/components/conversion-paths.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversionPaths } from "@/components/results/conversion-paths";

const signInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

describe("ConversionPaths", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
    vi.restoreAllMocks();
  });

  it("renders the 3-day urgency copy and a Google button", () => {
    render(<ConversionPaths assessmentId="aid-1" />);
    expect(screen.getByText(/expires in 3 days/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it("starts Google OAuth with the claim id in redirectTo", async () => {
    render(<ConversionPaths assessmentId="aid-1" />);
    await userEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback?claim=aid-1"),
        }),
      }),
    );
  });

  it("posts a lead and acknowledges it inline", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    render(<ConversionPaths assessmentId="aid-1" />);
    await userEvent.type(screen.getByLabelText(/Email me my results/i), "student@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Email me my results/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leads",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText(/We'll send your results to student@example.com/i)).toBeInTheDocument();
  });

  it("disables the Google button when there is no assessment id", () => {
    render(<ConversionPaths assessmentId={null} />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/components/conversion-paths.test.tsx`
Expected: FAIL — `assessmentId` prop / OAuth wiring not present.

- [ ] **Step 3: Rewrite `conversion-paths.tsx`**

```tsx
// components/results/conversion-paths.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function expiryDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function ConversionPaths({ assessmentId }: { assessmentId: string | null }) {
  const [leadEmail, setLeadEmail] = useState("");
  const [captured, setCaptured] = useState<string | null>(null);

  const continueWithGoogle = async () => {
    if (!assessmentId) return;
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?claim=${assessmentId}`;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  };

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentId) return;
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: leadEmail, assessmentId }),
    });
    setCaptured(leadEmail);
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Tier 1 — Google account */}
      <div className="rounded-lg border border-line bg-surface p-6">
        <h3 className="text-[21px]">Keep your assessment</h3>
        <p className="mt-2 text-[15px] text-ink-soft">
          Your assessment expires in 3 days (by {expiryDate()}). Create a free account with Google to keep it and
          get updates as visa rules change.
        </p>
        <div className="mt-4">
          <Button size="lg" onClick={continueWithGoogle} disabled={!assessmentId}>
            Continue with Google
          </Button>
        </div>
      </div>

      {/* Tier 2 — email lead only */}
      <form className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4" onSubmit={submitLead}>
        <label htmlFor="lead-email" className="text-[15px] text-ink-soft">
          Want to discuss with family first? Email me my results
        </label>
        <div className="flex flex-wrap gap-3">
          <input
            id="lead-email"
            type="email"
            required
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            className="min-w-[220px] flex-1 rounded-sm border border-line-2 bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
          />
          <Button type="submit" variant="ghost" disabled={!assessmentId}>
            Email me my results
          </Button>
        </div>
        {captured ? (
          <p className="text-[15px] text-strong">We&apos;ll send your results to {captured}.</p>
        ) : null}
      </form>

      {/* Tier 3 — come back later */}
      <p className="text-center font-mono text-[12.5px] text-ink-faint">
        Or come back later — your assessment is available for 3 days.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/components/conversion-paths.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck (results.tsx ↔ conversion-paths now agree)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/results/conversion-paths.tsx tests/components/conversion-paths.test.tsx
git commit -m "feat: wire conversion to Google OAuth and lead capture"
```

---

## Task 13: Carry the assessment id through the assess flow

**Files:**
- Modify: `components/assess/assess-flow.tsx`
- Create: `tests/assess/assess-flow-id.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/assess/assess-flow-id.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Stub the heavy children so we can assert wiring only.
vi.mock("@/components/wizard/wizard", () => ({
  Wizard: ({ onComplete }: { onComplete: (p: unknown) => void }) => (
    <button onClick={() => onComplete({ homeCountry: "Nepal" })}>finish</button>
  ),
}));
vi.mock("@/components/assess/profile-recap", () => ({
  ProfileRecap: ({ onDone }: { onDone: () => void }) => {
    onDone();
    return <div>recap</div>;
  },
}));
vi.mock("@/components/results/results", () => ({
  Results: ({ assessmentId, mode }: { assessmentId: string | null; mode: string }) => (
    <div>
      results:{mode}:{assessmentId}
    </div>
  ),
}));

import { AssessFlow } from "@/components/assess/assess-flow";

describe("AssessFlow id wiring", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("passes the persisted id from /api/assess into Results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "aid-9", payload: { ok: true } }), { status: 200 }),
    );
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<AssessFlow />);
    await userEvent.click(screen.getByText("finish"));
    await waitFor(() => expect(screen.getByText(/results:anonymous:aid-9/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/assess/assess-flow-id.test.tsx`
Expected: FAIL — Results receives `undefined` for `assessmentId` (flow doesn't track id yet).

- [ ] **Step 3: Update `assess-flow.tsx`**

```tsx
// components/assess/assess-flow.tsx
"use client";

import { useEffect, useState } from "react";
import type { StudentProfile } from "@/lib/scoring/types";
import type { AssessmentPayload } from "@/lib/results/types";
import { Wizard } from "@/components/wizard/wizard";
import { ProfileRecap } from "./profile-recap";
import { Results } from "@/components/results/results";

type Phase = "wizard" | "recap" | "results";

export function AssessFlow() {
  const [phase, setPhase] = useState<Phase>("wizard");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [payload, setPayload] = useState<AssessmentPayload | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [recapElapsed, setRecapElapsed] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (phase !== "recap" || !payload || !recapElapsed) return;
    const id = setTimeout(() => setPhase("results"), 0);
    return () => clearTimeout(id);
  }, [phase, payload, recapElapsed]);

  const handleComplete = async (completed: StudentProfile) => {
    setProfile(completed);
    setPhase("recap");
    setRecapElapsed(false);
    setError(false);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completed),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as { id: string | null; payload: AssessmentPayload };
      setAssessmentId(data.id);
      setPayload(data.payload);
    } catch {
      setError(true);
    }
  };

  if (phase === "results" && payload) {
    return <Results payload={payload} mode="anonymous" assessmentId={assessmentId} />;
  }

  if (phase === "recap" && profile) {
    if (error) {
      return (
        <div className="mx-auto grid min-h-[60vh] max-w-narrow place-items-center px-5 text-center">
          <p className="text-ink-soft">Something went wrong scoring your assessment. Please refresh and try again.</p>
        </div>
      );
    }
    return <ProfileRecap profile={profile} onDone={() => setRecapElapsed(true)} />;
  }

  return <Wizard onComplete={handleComplete} />;
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/assess/assess-flow-id.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/assess/assess-flow.tsx tests/assess/assess-flow-id.test.tsx
git commit -m "feat: carry persisted assessment id into the results conversion"
```

---

## Task 14: Owner-only `/assessment/[id]` page

**Files:**
- Create: `app/assessment/[id]/page.tsx`
- Create: `tests/app/assessment-page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/assessment-page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const getUser = vi.fn();
const getOwnedAssessment = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("REDIRECT");
});
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getOwnedAssessment }));
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/components/results/results", () => ({
  Results: ({ mode }: { mode: string }) => <div>owned-results:{mode}</div>,
}));

import AssessmentPage from "@/app/assessment/[id]/page";

describe("/assessment/[id]", () => {
  beforeEach(() => {
    getUser.mockReset();
    getOwnedAssessment.mockReset();
    redirect.mockClear();
    notFound.mockClear();
  });

  it("redirects to /assess when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(AssessmentPage({ params: Promise.resolve({ id: "aid" }) })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/assess");
  });

  it("404s when the assessment is not owned / missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOwnedAssessment.mockResolvedValue(null);
    await expect(AssessmentPage({ params: Promise.resolve({ id: "aid" }) })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders owned results from the stored payload", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOwnedAssessment.mockResolvedValue({ id: "aid", owner: "u1", result: { result: { verdict: "possible" } } });
    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);
    expect(screen.getByText("owned-results:owned")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/app/assessment-page.test.tsx`
Expected: FAIL — page unresolved.

- [ ] **Step 3: Implement the page**

```tsx
// app/assessment/[id]/page.tsx
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

  // result holds the full AssessmentPayload snapshot (see /api/assess).
  const payload = row.result as unknown as AssessmentPayload;
  return (
    <main>
      <Results payload={payload} mode="owned" />
    </main>
  );
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/app/assessment-page.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/assessment/[id]/page.tsx tests/app/assessment-page.test.tsx
git commit -m "feat: add owner-only /assessment/[id] page"
```

---

## Task 15: Full verification + live RLS re-check

**Files:** none (verification + manual setup notes)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all tests pass (Plans 1–3).

- [ ] **Step 2: Typecheck, lint, build**

```bash
npm run typecheck
npm run lint
npm run build
```
Expected: all clean; routes `/api/assess`, `/api/leads`, `/auth/callback`, `/auth/signout`, `/assessment/[id]` compile.

- [ ] **Step 3: Re-run Supabase advisors against the committed schema**

Using the Supabase MCP on project `obfvrxixtautamflzxzq`, run `get_advisors` for both `security` and `performance`. Confirm only the known benign INFO notes remain (`leads` rls_enabled_no_policy; possibly `unused_index` until traffic). Fix anything else.

- [ ] **Step 4: Record the live-auth setup dependency**

Add a short note to `README.md` (or `docs/`) that live Google sign-in requires, one-time in the Supabase dashboard: Auth → Providers → Google enabled with a Google Cloud OAuth client id/secret, and the callback URL `<site>/auth/callback` registered. Populate `.env.local` from `.env.example` with the project URL, anon key, and **service-role key** (server-only).

- [ ] **Step 5: Commit any docs**

```bash
git add README.md
git commit -m "docs: note Google OAuth provider setup for live sign-in"
```

---

## Self-Review (controller checklist)

**Spec coverage (§ of the design spec):**
- §3.1 Google OAuth accounts → Task 12 (signInWithOAuth), Task 9 (callback) ✓
- §3.2 anon row + claim (Approach A) → Tasks 6 (persist), 9 (claim) ✓
- §3.3 store profile + result snapshot + rule_version → Task 6 ✓
- §3.4 Tier-2 lead capture only → Tasks 7, 12 ✓
- §3.5 unlock reveals matches; teasers "coming soon" → Task 11 ✓
- §4 lifecycle (assess → callback → /assessment/[id]) → Tasks 6, 9, 14 ✓
- §5 schema + RLS + least privilege + indexes → Task 1 (migration) ✓
- §6 file structure → all tasks ✓
- §7 error handling (insert fail → id null; expired/owned claim; 404) → Tasks 6, 9, 14 ✓
- §8 testing (repo, routes, components, RLS via MCP) → all + Task 15 ✓
- §9 security (service-role server-only, RLS, no user_metadata) → Tasks 1, 6–9 ✓

**Placeholder scan:** every code step is complete and runnable; no TBD/TODO. Manual setup items (Google provider, `.env.local`) are explicitly external config, not code placeholders. ✓

**Type consistency:** `createSupabaseAdminClient`, `createAnonymousAssessment(db, NewAssessment)`, `claimAssessment(db, {id,userId,nowIso})`, `getOwnedAssessment(db,id)`, `createLead(db,{email,assessmentId})`, `Results({payload,mode,assessmentId})`, `ConversionPaths({assessmentId})`, `UniversityMatches({...,unlocked})`, `GatedTeasers({onUnlock,unlocked})` are used identically across tasks. `result` jsonb = full `AssessmentPayload` everywhere. ✓
