import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("server-only", () => ({}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("@/components/auth/email-sign-in", () => ({
  EmailSignIn: () => <div data-testid="email-sign-in" />,
}));

import { InviteAcceptPanel } from "@/components/invitations/invite-accept-panel";
import { ACCEPT_CONFIRMATION } from "@/lib/invitations/accept-messages";

/**
 * MV-195 criterion 9 — the confirmation, after slice 3 gave it somewhere to point.
 *
 * MV-194 ended the accept flow at "Go to your dashboard", which was the honest answer while
 * the accepted case had no route. It is the wrong answer now: the student has just accepted
 * an invitation, and the one thing they want is the case they accepted it FOR.
 *
 * This is the visible marker that slice 3 landed, so it is asserted rather than assumed.
 */

const TOKEN = "a-plaintext-token";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, alreadyLinked: false }) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function accept() {
  render(<InviteAcceptPanel token={TOKEN} email="student@example.com" />);
  await userEvent.click(screen.getByRole("button", { name: /accept invitation/i }));
  await waitFor(() => expect(screen.getByText(ACCEPT_CONFIRMATION.heading)).toBeInTheDocument());
}

describe("the confirmation leads to the case that was just accepted", () => {
  it("offers the consultancy case as the primary next step", async () => {
    await accept();

    expect(screen.getByRole("link", { name: /consultancy/i })).toHaveAttribute(
      "href",
      "/consultancy",
    );
  });

  it("still says where the student's own work is, and that the two stay separate", async () => {
    await accept();

    expect(screen.getByText(ACCEPT_CONFIRMATION.separateCases)).toBeInTheDocument();
    expect(screen.getByText(ACCEPT_CONFIRMATION.dashboardNote)).toBeInTheDocument();
  });
});

describe("the signed-out branch is unchanged", () => {
  it("withholds the token and shows only sign-in", () => {
    // Decision B (MV-194): a visitor who has proven nothing is told nothing — not
    // whether the invitation exists, not which consultancy sent it.
    render(<InviteAcceptPanel token={null} email={null} />);

    expect(screen.getByTestId("email-sign-in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept invitation/i })).not.toBeInTheDocument();
  });
});
