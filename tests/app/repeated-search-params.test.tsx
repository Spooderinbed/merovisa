/**
 * MV-176 — a repeated query parameter (`?next=/a&next=/b`) reaches a Next.js
 * page as `string[]`, not `string`. `/auth` declared `{ next?: string }` and
 * handed the value straight to `safeNext`, which calls `.startsWith` on it:
 * two `next=` values were a 500 on the sign-in page, in production.
 *
 * These tests drive the URL, not the type — they pass arrays the way a visitor
 * (or a mis-built link) can, and assert the page still answers.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.CLAIM_HMAC_SECRET = "test-secret-must-be-32-chars-long-abc";
});

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth/auth-card", () => ({
  AuthCard: ({ nextPath, claimToken }: { nextPath?: string; claimToken?: string | null }) => (
    <div
      data-testid="auth-card"
      data-next={nextPath === undefined ? "(absent)" : nextPath}
      data-next-type={Array.isArray(nextPath) ? "array" : typeof nextPath}
      data-claim={claimToken ?? "(none)"}
    >
      auth-card
    </div>
  ),
}));

// The /assess page's own collaborators. It never calls a string method on a
// search param today, so its arrays do not crash — but its declared type is
// just as untruthful, and these pin what it does with one.
const { getPrimaryAssessmentForCase, resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } =
  vi.hoisted(() => ({
    getPrimaryAssessmentForCase: vi.fn(),
    resolvePersonalCaseId: vi.fn(),
    ensurePersonalCase: vi.fn(),
    checkCasePermission: vi.fn(),
  }));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForCase }));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
vi.mock("@/components/assess/assess-flow", () => ({
  AssessFlow: ({ fresh, signedIn }: { fresh?: boolean; signedIn?: boolean }) => (
    <div data-testid="flow" data-fresh={String(!!fresh)} data-signed-in={String(!!signedIn)}>
      flow
    </div>
  ),
}));
vi.mock("@/components/assess/assess-interstitial", () => ({
  AssessInterstitial: () => <div data-testid="interstitial">interstitial</div>,
}));
vi.mock("@/components/assess/claim-failure", () => ({
  ClaimFailure: ({ reason }: { reason: string }) => (
    <div data-testid="claim-failure" data-reason={reason}>
      claim failure
    </div>
  ),
}));

import { verifyClaim } from "@/lib/auth/hmac-claim";
import AuthPage from "@/app/(marketing)/auth/page";
import AssessPage from "@/app/(focused)/assess/page";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";
const OTHER_UUID = "22915637-f603-4821-8dd0-d9e52560c4f7";

describe("/auth with a repeated ?next=", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
  });

  // The regression itself. Against the pre-fix page this throws
  // `TypeError: input.startsWith is not a function` from safe-next.ts:3 —
  // a 500 on the sign-in page, not a redirect.
  it("redirects a signed-in visitor to the first path instead of throwing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(
      AuthPage({ searchParams: Promise.resolve({ next: ["/a", "/b"] }) }),
    ).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/a");
  });

  it("renders the sign-in card for a signed-out visitor instead of throwing", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AuthPage({ searchParams: Promise.resolve({ next: ["/a", "/b"] }) });
    render(ui);
    expect(screen.getByTestId("auth-card")).toBeInTheDocument();
  });

  it("hands AuthCard a string, never the array", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AuthPage({ searchParams: Promise.resolve({ next: ["/profile", "/matches"] }) });
    render(ui);
    const card = screen.getByTestId("auth-card");
    expect(card).toHaveAttribute("data-next-type", "string");
    expect(card).toHaveAttribute("data-next", "/profile");
  });

  it("treats an empty ?next= array as absent and falls back to /dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(AuthPage({ searchParams: Promise.resolve({ next: [] }) })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("leaves an empty ?next= array off the card rather than passing an empty string", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AuthPage({ searchParams: Promise.resolve({ next: [] }) });
    render(ui);
    expect(screen.getByTestId("auth-card")).toHaveAttribute("data-next", "(absent)");
  });

  // safeNext's existing rejections must still reject when they arrive first in
  // an array — collapsing the value must not route around the check.
  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash-prefixed", "/\\evil"],
    ["fully-qualified", "https://evil.com/path"],
    ["tab-hidden protocol-relative", `/${String.fromCharCode(0x09)}/evil.com`],
  ])("still rejects a %s first element and falls back to /dashboard", async (_label, hostile) => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(
      AuthPage({ searchParams: Promise.resolve({ next: [hostile, "/dashboard"] }) }),
    ).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  // A trailing safe value must not rescue a hostile first one: the first value
  // is the whole answer, so `?next=//evil.com&next=/profile` goes nowhere but
  // the default.
  it("does not fall through to a later safe value when the first is hostile", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(
      AuthPage({ searchParams: Promise.resolve({ next: ["//evil.com", "/profile"] }) }),
    ).rejects.toThrow("REDIRECT");
    expect(redirect).not.toHaveBeenCalledWith("/profile");
  });
});

/**
 * Review finding F1 — the bypass arrives as a *single* value, not a repeated one:
 * `/auth?next=/%09/evil.com`. Next decodes it to `/<tab>/evil.com`, which the
 * pre-fix `safeNext` returned unchanged (starts with `/`, not with `//`), Next's
 * relative `redirect()` put on the `Location` header verbatim, and the browser
 * resolved as `//evil.com` after stripping the tab — off-origin.
 *
 * These pin the caller's half of the contract: a rejected value must become
 * `/dashboard`, not a 500 and not the hostile destination.
 */
describe("/auth with a whitespace-hidden ?next=", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
  });

  it.each([
    ["%09 (tab)", 0x09],
    ["%0a (line feed)", 0x0a],
    ["%0d (carriage return)", 0x0d],
    ["a literal space", 0x20],
    ["a C1 control", 0x85],
  ])("redirects a signed-in visitor to /dashboard for %s", async (_label, code) => {
    const hostile = `/${String.fromCharCode(code)}/evil.com`;
    await expect(AuthPage({ searchParams: Promise.resolve({ next: hostile }) })).rejects.toThrow(
      "REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(redirect).not.toHaveBeenCalledWith(hostile);
  });

  it("still redirects a clean ?next= to where it asked", async () => {
    await expect(AuthPage({ searchParams: Promise.resolve({ next: "/matches" }) })).rejects.toThrow(
      "REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/matches");
  });
});

describe("/auth with a repeated ?assessment=", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
    getUser.mockResolvedValue({ data: { user: null } });
  });

  // Pre-fix this silently signed nothing: `String(["<uuid>", "<uuid>"])` is
  // `"<uuid>,<uuid>"`, which fails the shape check, so the visitor arriving
  // from their results lost the claim their assessment depends on.
  it("signs a claim for the first assessment id", async () => {
    const ui = await AuthPage({
      searchParams: Promise.resolve({ assessment: [ASSESSMENT_UUID, OTHER_UUID] }),
    });
    render(ui);
    const token = screen.getByTestId("auth-card").getAttribute("data-claim")!;
    expect(verifyClaim(token)).toEqual({ assessmentId: ASSESSMENT_UUID });
  });

  it("signs nothing when the first assessment id is not an assessment id", async () => {
    const ui = await AuthPage({
      searchParams: Promise.resolve({ assessment: ["../../etc/passwd", ASSESSMENT_UUID] }),
    });
    render(ui);
    expect(screen.getByTestId("auth-card")).toHaveAttribute("data-claim", "(none)");
  });

  it("signs nothing for an empty ?assessment= array", async () => {
    const ui = await AuthPage({ searchParams: Promise.resolve({ assessment: [] }) });
    render(ui);
    expect(screen.getByTestId("auth-card")).toHaveAttribute("data-claim", "(none)");
  });
});

describe("/assess with repeated parameters", () => {
  beforeEach(() => {
    getUser.mockReset();
    getPrimaryAssessmentForCase.mockReset();
    resolvePersonalCaseId.mockResolvedValue("case-1");
    ensurePersonalCase.mockResolvedValue("case-1");
    checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
  });

  it("honours the first ?new= value", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForCase.mockResolvedValue({
      id: "a1",
      destination_id: "australia",
      created_at: "2026-05-15T00:00:00Z",
    });
    const ui = await AssessPage({ searchParams: Promise.resolve({ new: ["1", "0"] }) });
    render(ui);
    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });

  it("keeps the interstitial when the first ?new= value is not 1", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForCase.mockResolvedValue({
      id: "a1",
      destination_id: "australia",
      created_at: "2026-05-15T00:00:00Z",
    });
    const ui = await AssessPage({ searchParams: Promise.resolve({ new: ["0", "1"] }) });
    render(ui);
    expect(screen.getByTestId("interstitial")).toBeInTheDocument();
  });

  it("treats an empty ?new= array as absent", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AssessPage({ searchParams: Promise.resolve({ new: [] }) });
    render(ui);
    expect(screen.getByTestId("flow")).toHaveAttribute("data-fresh", "false");
  });

  it("renders the claim-failure recovery for a repeated ?error=", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AssessPage({ searchParams: Promise.resolve({ error: ["expired", "auth"] }) });
    render(ui);
    expect(screen.getByTestId("claim-failure")).toHaveAttribute("data-reason", "expired");
  });

  it("ignores a repeated ?error= whose first value is unrecognised", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AssessPage({ searchParams: Promise.resolve({ error: ["bogus", "expired"] }) });
    render(ui);
    expect(screen.queryByTestId("claim-failure")).not.toBeInTheDocument();
    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });
});
