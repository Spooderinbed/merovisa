import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

import { EmailSignIn } from "@/components/auth/email-sign-in";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ok = (body: unknown) => ({ ok: true, json: async () => body });
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call]![1].body as string);

async function sendCode(email = "aarav@example.com") {
  await userEvent.type(screen.getByLabelText(/email address/i), email);
  await userEvent.click(screen.getByRole("button", { name: /send.*code/i }));
}

describe("EmailSignIn", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  it("offers a real email field instead of a dead 'not ready yet' note", () => {
    render(<EmailSignIn />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send.*code/i })).toBeInTheDocument();
  });

  it("sends the code and moves to the code step, naming the address it used", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));
    render(<EmailSignIn />);
    await sendCode();

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/email/start");
    expect(bodyOf(0).email).toBe("aarav@example.com");
    expect(await screen.findByText(/aarav@example.com/)).toBeInTheDocument();

    const codeField = screen.getByLabelText(/6-digit code/i);
    expect(codeField).toHaveAttribute("autocomplete", "one-time-code");
    expect(codeField).toHaveAttribute("inputmode", "numeric");
  });

  it("carries the assessment claim and next path into the send request", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));
    render(<EmailSignIn claimToken="tok.123.sig" nextPath="/profile" />);
    await sendCode();
    expect(bodyOf(0)).toMatchObject({ claim: "tok.123.sig", next: "/profile" });
  });

  it("signs in on a good code and follows the server's landing page", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ ok: true }))
      .mockResolvedValueOnce(ok({ redirectTo: "/assessment/abc" }));
    render(<EmailSignIn claimToken="tok.123.sig" />);
    await sendCode();

    await userEvent.type(await screen.findByLabelText(/6-digit code/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(fetchMock.mock.calls[1]![0]).toBe("/api/auth/email/verify");
    expect(bodyOf(1)).toMatchObject({ code: "123456", claim: "tok.123.sig" });
    expect(replace).toHaveBeenCalledWith("/assessment/abc");
  });

  it("keeps the student on the code step and explains when the code is wrong", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ ok: true }))
      .mockResolvedValueOnce(fail(401, { error: "That code didn't work. Check it, or send a new one." }));
    render(<EmailSignIn />);
    await sendCode();

    await userEvent.type(await screen.findByLabelText(/6-digit code/i), "000000");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/that code didn't work/i);
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  // Trust: never advance to "enter your code" for a code that was never sent.
  it("stays on the email step and says so when the code could not be sent", async () => {
    fetchMock.mockResolvedValueOnce(fail(502, { error: "We couldn't send your code just now. Try again in a minute." }));
    render(<EmailSignIn />);
    await sendCode();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send your code/i);
    expect(screen.queryByLabelText(/6-digit code/i)).toBeNull();
  });

  it("lets the student go back and correct a mistyped address", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));
    render(<EmailSignIn />);
    await sendCode("wrong@example.com");

    await userEvent.click(await screen.findByRole("button", { name: /different address/i }));
    expect(screen.getByLabelText(/email address/i)).toHaveValue("wrong@example.com");
    expect(screen.queryByLabelText(/6-digit code/i)).toBeNull();
  });
});
