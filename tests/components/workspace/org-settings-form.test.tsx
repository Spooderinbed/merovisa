import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { OrgSettingsForm } from "@/components/workspace/org-settings-form";

/**
 * What cell 2's form TELLS the owner when a save does not land.
 *
 * The form used to collapse every status it did not name into "That change was
 * not allowed.", so an expired session and a database outage were both reported
 * as a refusal of the owner — who then had no way to know whether to retry or to
 * go and ask someone. `app/(app)/workspace/page.tsx` already states the rule for
 * the read side; these are the write side of it.
 *
 * The 422 cases are the second defect: the form mapped the STATUS to one fixed
 * sentence about the web address, so clearing the Organization name pointed the
 * owner at a field that was untouched and correct.
 */

const ORG = "11111111-1111-4111-8111-111111111111";

function response(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Zod's `flatten()` as the route returns it — see the route-side test that pins this shape. */
function validationBody(fieldErrors: Record<string, string[]>) {
  return { error: "Validation failed", issues: { formErrors: [], fieldErrors } };
}

async function saveOnce(res: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
  render(<OrgSettingsForm organizationId={ORG} name="Anadi Education" slug="anadi" />);
  // The button stays disabled until something actually changed.
  await userEvent.type(screen.getByRole("textbox", { name: "Organization name" }), "!");
  await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrgSettingsForm — what a failed save says", () => {
  it("reports an expired session as a session, not as a refusal", async () => {
    await saveOnce(response(401));
    expect(await screen.findByText(/session has ended/i)).toBeInTheDocument();
    expect(screen.queryByText(/was not allowed/i)).not.toBeInTheDocument();
  });

  it("reports a write failure as our problem, not as a refusal", async () => {
    // `lib/org/repo.ts` maps every PostgREST code except 42501/23505 to
    // `write-failed`, and the route 500s it. Telling the owner they lacked
    // permission would send them to ask someone who cannot help.
    await saveOnce(response(500));
    expect(await screen.findByText(/went wrong on our side/i)).toBeInTheDocument();
    expect(screen.queryByText(/was not allowed/i)).not.toBeInTheDocument();
  });

  it("still reports a genuine 403 as a refusal", async () => {
    await saveOnce(response(403));
    expect(await screen.findByText("That change was not allowed.")).toBeInTheDocument();
  });

  it("reports a taken slug against the web address", async () => {
    await saveOnce(response(409));
    expect(await screen.findByText(/web address is already taken/i)).toBeInTheDocument();
  });

  it("blames the NAME when the route rejected the name", async () => {
    // The reported defect: clearing the organization name rendered a sentence
    // about lowercase letters and hyphens in a web address the owner never
    // touched.
    await saveOnce(response(422, validationBody({ name: ["String must contain at least 1 character(s)"] })));
    expect(await screen.findByText(/enter an organization name/i)).toBeInTheDocument();
    // Matched on the slug SENTENCE, not on "web address" — that phrase is also the
    // field's own label, which is present either way.
    expect(screen.queryByText(/lowercase letters, numbers and hyphens/i)).not.toBeInTheDocument();
  });

  it("blames the WEB ADDRESS when the route rejected the slug", async () => {
    await saveOnce(response(422, validationBody({ slug: ["Invalid"] })));
    expect(await screen.findByText(/lowercase letters, numbers and hyphens/i)).toBeInTheDocument();
    expect(screen.queryByText(/enter an organization name/i)).not.toBeInTheDocument();
  });

  it("names both fields when the route rejected both", async () => {
    await saveOnce(response(422, validationBody({ name: ["Too big"], slug: ["Invalid"] })));
    expect(await screen.findByText(/enter an organization name/i)).toBeInTheDocument();
    expect(screen.getByText(/lowercase letters, numbers and hyphens/i)).toBeInTheDocument();
  });

  it("falls back to both fields for a 422 that names none — the refine and unknown keys", async () => {
    // `.refine()` and `.strict()` both produce issues with no `path`, so they land
    // in `formErrors` and there is no field to point at.
    await saveOnce(response(422, { error: "Validation failed", issues: { formErrors: ["Provide a name or a slug"], fieldErrors: {} } }));
    expect(await screen.findByText(/check the name and the web address/i)).toBeInTheDocument();
  });

  it("confirms a save that landed", async () => {
    await saveOnce(response(200, { ok: true }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
});
