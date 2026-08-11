import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { CaseCreateForm } from "@/components/workspace/case-create-form";

/**
 * Cell 8 from the BROWSER's side — the body this form sends, and what it says when
 * the create does not land.
 *
 * The component had no tests. Two things were therefore unpinned, and both are
 * decisions rather than incidentals:
 *
 * 1. **A blank email is OMITTED, never sent as `""`.** `cases.email` is nullable and
 *    "no email address on file" is a real state the surfaces render as a sentence.
 *    An empty string would be a third value that renders as an address the student
 *    does not have — and the route's `z.email()` would 422 it besides, so the form
 *    would break rather than merely misreport.
 * 2. **A 422 blames the fields; every other status does not.** The form must not
 *    tell an owner whose session lapsed to check the student's name.
 */

const ORG = "11111111-1111-4111-8111-111111111111";

function response(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function submit(res: unknown, fields: { name: string; email?: string }) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  render(<CaseCreateForm organizationId={ORG} />);
  await userEvent.type(screen.getByLabelText(/full name/i), fields.name);
  if (fields.email !== undefined) {
    await userEvent.type(screen.getByLabelText(/email address/i), fields.email);
  }
  await userEvent.click(screen.getByRole("button", { name: /add student/i }));
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CaseCreateForm — what it sends", () => {
  it("POSTs the organization's cases collection with a trimmed name", async () => {
    const fetchMock = await submit(response(200, { ok: true, caseId: "c1" }), {
      name: "  Asha Gurung  ",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/org/${ORG}/cases`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ displayName: "Asha Gurung" });
  });

  it("OMITS a blank email rather than sending an empty string", async () => {
    const fetchMock = await submit(response(200, { ok: true, caseId: "c1" }), {
      name: "Asha Gurung",
      email: "   ",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    // Not `email: ""`, and not `email: null` either — the key is absent, which is
    // what the route's `.optional()` field means and what lets the column stay NULL.
    expect(body).not.toHaveProperty("email");
  });

  it("sends a trimmed email when one was typed", async () => {
    const fetchMock = await submit(response(200, { ok: true, caseId: "c1" }), {
      name: "Asha Gurung",
      email: " asha@example.test ",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      displayName: "Asha Gurung",
      email: "asha@example.test",
    });
  });

  it("never names a column the route would refuse", async () => {
    const fetchMock = await submit(response(200, { ok: true, caseId: "c1" }), { name: "Asha" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    // The route is `.strict()`: linking a student is Stage 5's and the status column
    // takes its `'new'` default, so a form that sent either would 422 outright.
    expect(Object.keys(body)).toEqual(["displayName"]);
  });

  it("stays disabled until a name is typed", async () => {
    render(<CaseCreateForm organizationId={ORG} />);

    expect(screen.getByRole("button", { name: /add student/i })).toBeDisabled();
  });
});

describe("CaseCreateForm — what it says when the create fails", () => {
  it("returns to the list on success rather than into a half-built case page", async () => {
    await submit(response(200, { ok: true, caseId: "c1" }), { name: "Asha" });

    // Sending someone straight into a surface carrying only a status control would
    // imply there is more there than there is.
    expect(push).toHaveBeenCalledWith(`/workspace/${ORG}/students`);
    expect(refresh).toHaveBeenCalled();
  });

  it("blames the fields on a 422", async () => {
    await submit(response(422, { error: "Validation failed" }), { name: "Asha" });

    expect(await screen.findByText(/check the name and email address/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("reports an expired session as a session, not as a validation problem", async () => {
    await submit(response(401), { name: "Asha" });

    expect(await screen.findByText(/session has ended/i)).toBeInTheDocument();
    expect(screen.queryByText(/check the name/i)).not.toBeInTheDocument();
  });

  it("reports a write failure as our problem, not as a refusal", async () => {
    await submit(response(500), { name: "Asha" });

    expect(await screen.findByText(/went wrong on our side/i)).toBeInTheDocument();
    expect(screen.queryByText(/was not allowed/i)).not.toBeInTheDocument();
  });

  it("still reports a genuine 403 as a refusal", async () => {
    await submit(response(403), { name: "Asha" });

    expect(await screen.findByText("That change was not allowed.")).toBeInTheDocument();
  });

  it("reports a network failure rather than leaving the button spinning", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<CaseCreateForm organizationId={ORG} />);
    await userEvent.type(screen.getByLabelText(/full name/i), "Asha");
    await userEvent.click(screen.getByRole("button", { name: /add student/i }));

    expect(await screen.findByText(/went wrong on our side/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add student/i })).not.toBeDisabled();
  });

  it("announces every failure to a screen reader", async () => {
    await submit(response(500), { name: "Asha" });

    expect((await screen.findByText(/went wrong on our side/i)).getAttribute("role")).toBe("alert");
  });
});
