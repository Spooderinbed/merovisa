import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("server-only", () => ({}));

/**
 * MV-194 — the student-facing invitation page (Stage 5 slice 2).
 *
 * Three properties, and the first two are the ones no functional test would fail without:
 *
 *  * **Decision B — a signed-out visitor is told nothing.** Not whether the invitation
 *    exists, not which consultancy sent it, not who it names. And the token is not handed
 *    into client JS at all until there is a session.
 *  * **The founder decision of 2026-08-24, expressed as copy.** The two cases stay separate,
 *    so a returning student sees an EMPTY consultancy case — which means nothing on this page
 *    may imply their data came with them, and nothing may imply it was lost.
 *  * **The token travels in a POST body.** Never a query string, never a redirect.
 */

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace: vi.fn() }) }));

const { user } = vi.hoisted(() => ({ user: { current: null as { id: string; email: string | null } | null } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: user.current } }) },
  }),
}));

import InvitePage from "@/app/invite/[token]/page";

/** 43 base64url characters, the shape `mintInvitationToken` produces. */
const TOKEN = "Zm9vYmFyLXRva2VuLXZhbHVlLW5vYm9keS1zZWVzLXh4";
const EMAIL = "student@example.test";

const page = () => InvitePage({ params: Promise.resolve({ token: TOKEN }) });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  user.current = { id: "user-1", email: EMAIL };
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, caseId: "case-1" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MV-194 decision B — a signed-out visitor learns nothing", () => {
  beforeEach(() => {
    user.current = null;
  });

  it("asks them to sign in and offers the email code", async () => {
    render(await page());

    expect(screen.getByRole("heading", { name: /sign in to continue/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it("says nothing about the invitation, the case, or which consultancy sent it", async () => {
    const { container } = render(await page());
    const text = container.textContent ?? "";

    // The control: the sweep can see the page it is sweeping.
    expect(text.length).toBeGreaterThan(60);
    for (const leak of [/consultanc/i, /counsellor/i, /case\b/i, /expire/i, /invited/i]) {
      expect(text, `the signed-out page mentions ${leak}`).not.toMatch(leak);
    }
  });

  it("does not put the token in the page it renders", async () => {
    const { container } = render(await page());

    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it("offers no accept control at all — nothing is spent by a visitor who proved nothing", async () => {
    render(await page());

    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  it("offers no Google sign-in — OAuth needs a return URL, and the only one is this token", async () => {
    render(await page());

    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
  });
});

describe("MV-194 — a signed-in student, before accepting", () => {
  it("offers one accept control and names the account it will use", async () => {
    render(await page());

    expect(screen.getByRole("button", { name: /accept invitation/i })).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("says up front that their own work stays in their own account", async () => {
    const { container } = render(await page());

    expect(container.textContent).toMatch(/stay in your own account/i);
  });

  it("renders the token nowhere in the document", async () => {
    const { container } = render(await page());

    expect(container.innerHTML).not.toContain(TOKEN);
  });
});

describe("MV-194 — accepting", () => {
  it("POSTs the token in a BODY, to a URL that carries no token", async () => {
    render(await page());

    await userEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/invitations/accept");
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN });
  });

  it("confirms in language that neither claims a transfer nor implies a loss", async () => {
    const { container } = render(await page());

    await userEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /connected to your consultancy/i })).toBeInTheDocument(),
    );
    const text = container.textContent ?? "";
    // A helpful "we've brought your profile across" is a DEFECT under the founder decision.
    for (const claim of [/brought (over|across)/i, /transferr?ed/i, /\bimported\b/i, /\bsynced\b/i, /\bmerged\b/i]) {
      expect(text, `the confirmation claims a transfer: ${claim}`).not.toMatch(claim);
    }
    // And the opposite failure: an empty case must not read as something being taken away.
    for (const loss of [/\blost\b/i, /\bdeleted\b/i, /start(ing)? (again|from scratch)/i]) {
      expect(text, `the confirmation implies a loss: ${loss}`).not.toMatch(loss);
    }
    expect(text).toMatch(/nothing has been taken away/i);
  });

  it("decision C — a second click reports that they were already connected", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, caseId: "case-1", alreadyLinked: true }),
    });
    render(await page());

    await userEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() => expect(screen.getByText(/already accepted this invitation/i)).toBeInTheDocument());
  });

  it("shows the route's own message on a refusal, and stays on the page", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This invitation has expired. Ask your consultancy to send you a new one.", reason: "expired" }),
    });
    render(await page());

    await userEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/expired/i));
    expect(screen.getByRole("button", { name: /accept invitation/i })).toBeInTheDocument();
  });

  it("decision A — an address mismatch offers a way to sign in as somebody else", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This invitation was sent to a different email address.", reason: "email-mismatch" }),
    });
    render(await page());

    await userEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /use a different address/i })).toBeInTheDocument(),
    );
  });

  it("no OTHER refusal offers it — a sign-out control is an answer to exactly one problem", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This invitation has expired.", reason: "expired" }),
    });
    render(await page());

    await userEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /use a different address/i })).not.toBeInTheDocument();
  });
});
