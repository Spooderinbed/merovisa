# Next-Step Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plan becomes the single "what's next" brain: the dashboard NEXT STEP panel consumes the plan's top open actionable item via a shared selector, items complete per a verified/self-reported model with an in-progress state, and "All caught up" renders only at zero open items.

**Architecture:** A pure selector module (`lib/plan/select.ts`) encodes the plan page's existing ordering (impact groups, then visa-prep sequence) and the open/actionable distinction; a completion-meta module (`lib/plan/completion.ts`) declares which kinds are system-verified (completion computed by `invalidatePlan`, no Done button) vs self-reported. Waiting state is a nullable `started_at` column on `plan_items` — status stays `todo`, so every existing "open" query, the partial unique index, and `invalidatePlan` keep working unchanged.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (additive migration), Zod, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-10-next-step-unification-design.md` (pinned copy strings live there).

**Branch:** `next-step-unification` off master. Never stage CLAUDE.md, tests/integration/wizard-to-results.test.tsx, docs/debugging/. Goldens and scoring untouched.

---

### Task 1: Selector + completion meta + startedAt plumbing (lib only)

**Files:**
- Create: `lib/plan/select.ts`, `lib/plan/completion.ts`, `tests/plan/select.test.ts`, `supabase/migrations/20260610150000_add_plan_items_started_at.sql`
- Modify: `lib/plan/types.ts` (PlanItemRow + `startedAt`), `lib/supabase/types.ts` (plan_items + `started_at`), `lib/plan/repo.ts` (mapRow, clear on status change), test fixtures: `tests/components/plan/plan-list.test.tsx`, `tests/components/plan/plan-item-card.test.tsx`, `tests/app/plan-page.test.tsx` (add `startedAt: null` to PlanItemRow literals)

- [ ] **Step 1: Write the failing tests** — `tests/plan/select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectNextStep, orderOpenItems } from "@/lib/plan/select";
import { completionFor } from "@/lib/plan/completion";
import type { PlanItemRow } from "@/lib/plan/types";

const mk = (over: Partial<PlanItemRow>): PlanItemRow => ({
  id: 1, owner: "u1", kind: "k", impact: "medium", title: "T", body: null,
  liftEstimate: null, timeEstimate: null, status: "todo",
  createdAt: "2026-06-10", completedAt: null, startedAt: null, ...over,
});

describe("orderOpenItems", () => {
  it("mirrors the plan page: impact groups first, then visa prep in sequence", () => {
    const items = [
      mk({ id: 1, kind: "prepare-police-certificate", impact: "medium" }),
      mk({ id: 2, kind: "prepare-gs-answers", impact: "high" }),
      mk({ id: 3, kind: "add-grade", impact: "high" }),
      mk({ id: 4, kind: "set-name", impact: "low" }),
      mk({ id: 5, kind: "upload-ielts-report", impact: "medium" }),
      mk({ id: 6, kind: "done-one", status: "done" }),
    ];
    expect(orderOpenItems(items).map((i) => i.id)).toEqual([3, 5, 4, 2, 1]);
  });
});

describe("selectNextStep", () => {
  it("returns the top open actionable item", () => {
    const sel = selectNextStep([mk({ id: 1, impact: "low" }), mk({ id: 2, impact: "high" })]);
    expect(sel.state).toBe("next");
    expect(sel.item?.id).toBe(2);
  });
  it("skips in-progress items to the next actionable one", () => {
    const sel = selectNextStep([
      mk({ id: 1, impact: "high", startedAt: "2026-06-10T00:00:00Z" }),
      mk({ id: 2, impact: "medium" }),
    ]);
    expect(sel.item?.id).toBe(2);
    expect(sel.waitingCount).toBe(1);
  });
  it("is 'waiting' when every open item is in progress — never 'caught-up'", () => {
    const sel = selectNextStep([mk({ id: 1, startedAt: "2026-06-10T00:00:00Z" })]);
    expect(sel.state).toBe("waiting");
    expect(sel.openCount).toBe(1);
  });
  it("is 'caught-up' only at zero open items", () => {
    expect(selectNextStep([]).state).toBe("caught-up");
    expect(selectNextStep([mk({ status: "done" }), mk({ id: 2, status: "dismissed" })]).state).toBe("caught-up");
  });
});

describe("completionFor", () => {
  it("classifies profile/document/match-observable kinds as verified with a completing surface", () => {
    expect(completionFor("upload-ielts-report")).toEqual({ completion: "verified", href: "/documents", cta: "Upload in documents →" });
    expect(completionFor("add-grade").completion).toBe("verified");
    expect(completionFor("start-passport-process").href).toBe("/documents");
  });
  it("classifies external actions as self-reported with the plan as CTA", () => {
    for (const k of ["prepare-gs-answers", "apply-for-noc", "season-funds-six-months", "add-safer-options"]) {
      expect(completionFor(k)).toEqual({ completion: "self-reported", href: "/plan", cta: "Open your plan →" });
    }
  });
  it("defaults unknown kinds to self-reported (forward compatibility)", () => {
    expect(completionFor("future-kind").completion).toBe("self-reported");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/plan/select.test.ts` → FAIL (modules don't exist).

- [ ] **Step 3: Implement.**

`lib/plan/types.ts` — add to PlanItemRow after `completedAt`:
```ts
  startedAt: string | null;
```

`supabase/migrations/20260610150000_add_plan_items_started_at.sql`:
```sql
-- Waiting state for self-reported plan items ("mark as in progress").
-- status stays 'todo' so the partial unique index and every open-item query
-- keep working; started_at IS NOT NULL = removed from next-step selection.
alter table public.plan_items add column started_at timestamptz;
```

`lib/supabase/types.ts` — plan_items Row gets `started_at: string | null`; Insert/Update get `started_at?: string | null`.

`lib/plan/repo.ts` — `mapRow` gains `startedAt: r.started_at`; `setPlanItemStatus` update object gains `started_at: null` (any explicit status change resets waiting).

`lib/plan/select.ts`:
```ts
import type { Impact, PlanItemRow } from "./types";
import { isVisaPrep, visaPrepOrder } from "./phases";

export interface PlanGroups {
  high: PlanItemRow[];
  medium: PlanItemRow[];
  low: PlanItemRow[];
  visaPrep: PlanItemRow[];
}

/** The plan page's grouping, extracted so every surface ranks items identically. */
export function groupOpenItems(items: PlanItemRow[]): PlanGroups {
  const open = items.filter((i) => i.status === "todo");
  const rest = open.filter((i) => !isVisaPrep(i.kind));
  const byImpact = (impact: Impact) => rest.filter((i) => i.impact === impact);
  return {
    high: byImpact("high"),
    medium: byImpact("medium"),
    low: byImpact("low"),
    visaPrep: open
      .filter((i) => isVisaPrep(i.kind))
      .sort((a, b) => visaPrepOrder(a.kind) - visaPrepOrder(b.kind)),
  };
}

export function orderOpenItems(items: PlanItemRow[]): PlanItemRow[] {
  const g = groupOpenItems(items);
  return [...g.high, ...g.medium, ...g.low, ...g.visaPrep];
}

export type NextStepState = "next" | "waiting" | "caught-up";

export interface NextStepSelection {
  state: NextStepState;
  item: PlanItemRow | null;
  openCount: number;
  waitingCount: number;
}

/** Open = status todo. Actionable = open and not marked in progress. */
export function selectNextStep(items: PlanItemRow[]): NextStepSelection {
  const open = orderOpenItems(items);
  const actionable = open.filter((i) => i.startedAt === null);
  if (open.length === 0) return { state: "caught-up", item: null, openCount: 0, waitingCount: 0 };
  if (actionable.length === 0)
    return { state: "waiting", item: null, openCount: open.length, waitingCount: open.length };
  return {
    state: "next",
    item: actionable[0]!,
    openCount: open.length,
    waitingCount: open.length - actionable.length,
  };
}
```

`lib/plan/completion.ts`:
```ts
export type CompletionKind = "verified" | "self-reported";

export interface CompletionMeta {
  completion: CompletionKind;
  /** Open-item CTA target: the surface that completes it (verified) or the plan (self-reported). */
  href: string;
  cta: string;
}

const PROFILE: CompletionMeta = { completion: "verified", href: "/profile", cta: "Add it in your profile →" };
const DOCUMENTS: CompletionMeta = { completion: "verified", href: "/documents", cta: "Upload in documents →" };
const SELF: CompletionMeta = { completion: "self-reported", href: "/plan", cta: "Open your plan →" };

/**
 * Verified kinds complete from observed account state: their generator condition
 * watches a profile field, an upload, or matches — invalidatePlan auto-closes them
 * and the user gets no Done button. Everything else (external actions the system
 * cannot observe) is self-reported. add-safer-options is deliberately self-reported:
 * its generator condition watches match verdicts, not the shortlist the user edits.
 */
const VERIFIED: Record<string, CompletionMeta> = {
  "set-name": PROFILE,
  "add-grade": PROFILE,
  "add-english-score": PROFILE,
  "set-intended-field": PROFILE,
  "document-gap-reasons": PROFILE,
  "document-gap-evidence": PROFILE,
  "add-work-docs": PROFILE,
  "upload-ielts-report": DOCUMENTS,
  "upload-proof-of-funds": DOCUMENTS,
  "start-passport-process": DOCUMENTS,
};

export function completionFor(kind: string): CompletionMeta {
  return VERIFIED[kind] ?? SELF;
}
```

Fixtures: add `startedAt: null` to the `mk`/`item` literals in `tests/components/plan/plan-list.test.tsx`, `tests/components/plan/plan-item-card.test.tsx`, and any PlanItemRow literal in `tests/app/plan-page.test.tsx`.

- [ ] **Step 4: Verify green** — `npx vitest run tests/plan/select.test.ts` PASS, then `npm run typecheck`.
- [ ] **Step 5: Commit** — `git add lib/plan/select.ts lib/plan/completion.ts lib/plan/types.ts lib/plan/repo.ts lib/supabase/types.ts supabase/migrations/20260610150000_add_plan_items_started_at.sql tests/plan/select.test.ts tests/components/plan/plan-list.test.tsx tests/components/plan/plan-item-card.test.tsx tests/app/plan-page.test.tsx` → `feat(plan): shared next-step selector, completion meta, started_at waiting state`

### Task 2: API — in-progress toggle + verified-done guard

**Files:**
- Modify: `app/api/plan/action/route.ts`, `lib/plan/repo.ts` (add `setPlanItemStarted`, `getPlanItemKind`), `tests/api/plan-action.test.ts`

- [ ] **Step 1: Failing tests** — extend `tests/api/plan-action.test.ts`. Update the hoisted mock block to include the new repo functions and mock `getPlanItemKind`:

```ts
const { getUser, setPlanItemStatus, setPlanItemStarted, getPlanItemKind } = vi.hoisted(() => ({
  getUser: vi.fn(), setPlanItemStatus: vi.fn(), setPlanItemStarted: vi.fn(), getPlanItemKind: vi.fn(),
}));
vi.mock("@/lib/plan/repo", () => ({ setPlanItemStatus, setPlanItemStarted, getPlanItemKind }));
```
New tests (reset the new mocks in beforeEach; existing tests get `getPlanItemKind.mockResolvedValue("k")` via beforeEach default):
```ts
  it("marks a self-reported item in progress", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPlanItemKind.mockResolvedValue("apply-for-noc");
    setPlanItemStarted.mockResolvedValue(true);
    const res = await POST(req({ id: 7, started: true }));
    expect(res.status).toBe(200);
    expect(setPlanItemStarted).toHaveBeenCalledWith({ tag: "admin" }, "u1", 7, true);
  });

  it("rejects manual done on a verified item (computed truth wins)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPlanItemKind.mockResolvedValue("upload-ielts-report");
    const res = await POST(req({ id: 7, status: "done" }));
    expect(res.status).toBe(422);
    expect(setPlanItemStatus).not.toHaveBeenCalled();
  });

  it("rejects in-progress on a verified item", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPlanItemKind.mockResolvedValue("upload-ielts-report");
    const res = await POST(req({ id: 7, started: true }));
    expect(res.status).toBe(422);
  });
```

- [ ] **Step 2: RED** — `npx vitest run tests/api/plan-action.test.ts`.

- [ ] **Step 3: Implement.** `lib/plan/repo.ts`:
```ts
export async function setPlanItemStarted(
  db: DB,
  owner: string,
  id: number,
  started: boolean,
): Promise<boolean> {
  const { error } = await db
    .from("plan_items")
    .update({ started_at: started ? new Date().toISOString() : null })
    .eq("owner", owner)
    .eq("id", id)
    .eq("status", "todo");
  return !error;
}

export async function getPlanItemKind(db: DB, owner: string, id: number): Promise<string | null> {
  const { data } = await db.from("plan_items").select("kind").eq("owner", owner).eq("id", id).maybeSingle();
  return data?.kind ?? null;
}
```
`app/api/plan/action/route.ts` — schema becomes a union; verified guard before any write:
```ts
const BodySchema = z.union([
  z.object({ id: z.number().int().positive(), status: z.enum(["todo", "done", "dismissed"]) }),
  z.object({ id: z.number().int().positive(), started: z.boolean() }),
]);
```
After auth, before acting:
```ts
  const adminDb = createSupabaseAdminClient();
  const kind = await getPlanItemKind(adminDb, data.user.id, parsed.data.id);
  const verified = kind !== null && completionFor(kind).completion === "verified";
  if (verified && ("started" in parsed.data || parsed.data.status === "done")) {
    return NextResponse.json(
      { error: "This item completes automatically from your account — it can't be updated by hand." },
      { status: 422 },
    );
  }
  const ok = "started" in parsed.data
    ? await setPlanItemStarted(adminDb, data.user.id, parsed.data.id, parsed.data.started)
    : await setPlanItemStatus(adminDb, data.user.id, parsed.data.id, parsed.data.status);
```

- [ ] **Step 4: GREEN** — route tests pass; typecheck.
- [ ] **Step 5: Commit** — `feat(plan-api): in-progress toggle; verified items reject manual done`

### Task 3: Plan UI — kind-aware controls

**Files:**
- Modify: `components/plan/plan-item-card.tsx`, `components/plan/plan-list.tsx`, `tests/components/plan/plan-item-card.test.tsx`

- [ ] **Step 1: Failing tests** (existing fixture kind "k" falls back to self-reported, so existing assertions stay valid):
```ts
  it("verified item: no Done button, CTA to the completing surface, Dismiss kept", () => {
    render(<PlanItemCard item={{ ...item, kind: "upload-ielts-report" }} />);
    expect(screen.queryByRole("button", { name: /^Done$/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Upload in documents/i })).toHaveAttribute("href", "/documents");
    expect(screen.getByRole("button", { name: /Dismiss/i })).toBeInTheDocument();
  });

  it("self-reported item: POSTs started=true on 'Mark as in progress' and shows the badge", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<PlanItemCard item={{ ...item, kind: "apply-for-noc" }} />);
    await userEvent.click(screen.getByRole("button", { name: /Mark as in progress/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ id: 1, started: true });
    expect(screen.getByText(/^In progress$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to open/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Done$/i })).toBeInTheDocument();
  });

  it("renders an already-started item with the badge and undo", () => {
    render(<PlanItemCard item={{ ...item, kind: "apply-for-noc", startedAt: "2026-06-10T00:00:00Z" }} />);
    expect(screen.getByText(/^In progress$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to open/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement** `plan-item-card.tsx`: derive `const meta = completionFor(item.kind);` and `const [started, setStarted] = useState(item.startedAt !== null);`. The action POST gains a `setStartedState` variant sending `{ id: item.id, started }`. Open-state controls:
  - verified: `<Link href={meta.href}>` styled like the Done pill (`border-strong bg-strong-tint text-strong`) with `meta.cta`; Dismiss button kept; no Done, no in-progress toggle.
  - self-reported, not started: Done + "Mark as in progress" + Dismiss.
  - self-reported, started: mono "In progress" pill (`border-line-2 bg-bg-tint text-ink-soft`), Done, "Back to open" (sends `started: false`).
  `plan-list.tsx`: replace the local filter/sort block with `const { high, medium, low, visaPrep } = groupOpenItems(items);` plus the existing `open`/`closed` splits (`open.length` from the groups). Rendering unchanged — existing plan-list tests pin this.

- [ ] **Step 4: GREEN** — card + list + page tests pass.
- [ ] **Step 5: Commit** — `feat(plan-ui): verified items lose Done, self-reported gain in-progress`

### Task 4: Dashboard — prompt consumes the selector + visible CTA token

**Files:**
- Modify: `components/dashboard/prompt-card.tsx`, `app/(app)/dashboard/page.tsx`, `tests/components/dashboard/prompt-card.test.tsx`, `tests/app/dashboard-page.test.tsx`

- [ ] **Step 1: Failing tests** — rewrite `prompt-card.test.tsx` around the new prop (`prompt`), with the spec's pinned copy:
```ts
const next = (over: Partial<PlanItemRow> = {}): PromptState => ({
  kind: "next",
  item: { id: 1, owner: "u1", kind: "upload-ielts-report", impact: "medium", title: "Upload your IELTS report",
    body: "Uploading the official report lets us check per-band scores.", liftEstimate: null, timeEstimate: null,
    status: "todo", createdAt: "2026-06-10", completedAt: null, startedAt: null, ...over },
});
// 1. profile-incomplete unchanged: "Your next best step" + link to /profile
// 2. next (verified kind): renders item title; CTA link "Upload in documents →" href /documents;
//    CTA classes include bg-bg and text-primary (the visible-token fix)
// 3. next (self-reported kind, e.g. apply-for-noc): CTA "Open your plan →" href /plan
// 4. waiting: "Everything is underway" + "All 3 remaining plan items are marked in progress." + link /plan
// 5. caught-up: "All caught up" + "Nothing on your plan needs action right now."; the string
//    "refresh your assessment" must NOT appear
```
`dashboard-page.test.tsx`: mock `@/lib/plan/repo` → `listOpenPlanForUser`; PromptCard mock renders `prompt.kind`; assert: open plan items ⇒ prompt kind `next` (the audit repro inverted); `[]` ⇒ `caught-up`; no profile ⇒ `profile-incomplete`.

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement.** `prompt-card.tsx`:
```ts
export type PromptState =
  | { kind: "profile-incomplete" }
  | { kind: "next"; item: PlanItemRow }
  | { kind: "waiting"; openCount: number }
  | { kind: "caught-up" };
```
Rendering (all copy from the spec): caught-up = neutral panel, h-eyebrow "Next step", body "Nothing on your plan needs action right now. We'll surface the next step here when something changes." + `<Link href="/plan">See your plan →</Link>` (ink-soft link). waiting = neutral panel, title "Everything is underway", body `All {openCount} remaining plan items are marked in progress. Check your plan if anything has changed.` + link "Open your plan →". next = existing dark `bg-primary` panel: eyebrow, `<h3>{item.title}</h3>`, `<p className="line-clamp-3">{item.body}</p>`, CTA pill `<Link href={meta.href} className="... rounded-pill bg-bg px-4 py-2 text-[14px] font-medium text-primary ...">{meta.cta}</Link>` where `meta = completionFor(item.kind)` — `bg-bg` + `text-primary` resolve to paper/teal in light and dark-paper/light-teal in dark, never the panel color. profile-incomplete = existing dark-panel copy unchanged ("Your next best step", link `/profile` "Add details →") with the same fixed CTA classes.
`app/(app)/dashboard/page.tsx`: add `listOpenPlanForUser(supabase, user.id)` to the parallel fetch; replace `pickPromptKind` with:
```ts
function pickPrompt(profileRow: unknown, primary: unknown, planItems: PlanItemRow[]): PromptState {
  if (!profileRow || !primary) return { kind: "profile-incomplete" };
  const sel = selectNextStep(planItems);
  if (sel.state === "next") return { kind: "next", item: sel.item! };
  if (sel.state === "waiting") return { kind: "waiting", openCount: sel.openCount };
  return { kind: "caught-up" };
}
```
(The old `ielts-missing` special case dies — `upload-ielts-report` is a plan item and surfaces by rank.)

- [ ] **Step 4: GREEN** — prompt-card + dashboard-page tests; `grep -r "refresh your assessment" app components lib` returns nothing.
- [ ] **Step 5: Commit** — `feat(dashboard): next-step panel reads the plan via the shared selector`

### Task 5: Migration to dev DB, browser verification, docs, merge

- [ ] Apply `alter table public.plan_items add column started_at timestamptz;` to the dev Supabase instance (MCP `execute_sql`), confirm with a select.
- [ ] Full gate: `npm run typecheck`, `npm run lint`, `npx vitest run`; protected-path diff empty; WIP trio unstaged.
- [ ] Browser: dashboard NEXT STEP equals the plan page's top open item; "Mark as in progress" on it moves the dashboard to the next item; verified item card shows link not Done; CTA computed color ≠ panel background in light and dark.
- [ ] `docs/PROJECT_STATUS.md` entry + ledger note; commit docs → `docs(next-step): unification slice — status + spec + plan`.
- [ ] `git merge --ff-only next-step-unification` on master, push, verify ref line.
