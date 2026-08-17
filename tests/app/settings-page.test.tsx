import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("server-only", () => ({}));

const { getUser, getProfileForCase } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfileForCase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/profiles/repo", () => ({ getProfileForCase }));
vi.mock("@/components/profile/completeness-ring", () => ({
  CompletenessRing: ({ pct }: { pct: number }) => <div data-testid="ring">{pct}%</div>,
}));
vi.mock("@/components/profile/section-accordion", () => ({
  SectionAccordion: ({ title }: { title: string }) => (
    <div data-testid={`section-${title}`}>{title}</div>
  ),
}));

// MV-157: every migrated route and page resolves the actor's personal case and
// authorizes it before its first query. Both are mocked to the happy path here;
// the denial branch is asserted where the route owns it.
const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

import SettingsPage from "@/app/(app)/(student)/settings/page";
import ProfilePage from "@/app/(app)/(student)/profile/page";

beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
  getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
  getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Aarav Sharma" } } });
});

describe("/settings page", () => {
  it("owns the delete-account section", async () => {
    render(await SettingsPage());
    expect(screen.getByRole("heading", { name: /delete your account/i })).toBeInTheDocument();
  });

  it("keeps the type-DELETE confirmation contract intact after the move", async () => {
    render(await SettingsPage());
    const btn = screen.getByRole("button", { name: /delete my account/i });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    expect(btn).toBeEnabled();
  });
});

// MV-162 item 14: an exposed delete control plants the idea. The profile page
// stops rendering it; a plain "Settings" link keeps it reachable (the mobile tab
// bar has no settings tab and the app bar's nav is hidden below md).
describe("/profile page — account deletion moved out", () => {
  it("no longer renders the delete-account control", async () => {
    render(await ProfilePage());
    // Guards against a vacuous pass: the page really did render.
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete my account/i })).toBeNull();
    expect(screen.queryByText(/delete your account/i)).toBeNull();
  });

  it("links to settings so the control stays reachable", async () => {
    render(await ProfilePage());
    expect(screen.getByRole("link", { name: /^Settings$/i })).toHaveAttribute("href", "/settings");
  });
});
