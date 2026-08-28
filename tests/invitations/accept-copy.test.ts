import { describe, test, expect } from "vitest";
import {
  ACCEPT_CONFIRMATION,
  ACCEPT_FAILURE_MESSAGES,
  ACCEPT_PROMPT,
  ACCEPT_SIGN_IN_PROMPT,
  type AcceptRouteFailure,
} from "@/lib/invitations/accept-messages";

/**
 * MV-194 — the copy, which this slice owes a test for rather than an opinion (Stage 5
 * slice 2).
 *
 * The founder decision of 2026-08-24 keeps a student's two cases separate: accepting a
 * consultancy invitation links them to a SECOND case, and their profile and documents do not
 * follow them. That makes an empty consultancy case an accepted outcome — and it creates the
 * obligation the card states in one sentence: **nothing in this slice may imply their
 * existing data came with them, and nothing may imply it was lost.**
 *
 * Both halves are claims about text, and both fail silently. A later author writing "we've
 * brought your profile across" would break the founder decision without breaking a single
 * functional test, which is why this file exists and why the strings live in a module rather
 * than inside a component.
 */

/** Every failure the route can name, listed here so the check is exhaustive by construction. */
const FAILURES: AcceptRouteFailure[] = [
  "invalid-token",
  "email-mismatch",
  "already-accepted",
  "revoked",
  "expired",
  "invalid-input",
  "redeem-failed",
  "no-account-email",
  "case-already-linked",
  "link-failed",
];

const ALL_COPY = [
  ...Object.values(ACCEPT_FAILURE_MESSAGES),
  ...Object.values(ACCEPT_CONFIRMATION),
  ...Object.values(ACCEPT_PROMPT),
  ...Object.values(ACCEPT_SIGN_IN_PROMPT),
];

describe("MV-194 criterion 4 — every refusal says a different, actionable thing", () => {
  test("each failure has a message, and the list is exhaustive", () => {
    expect(Object.keys(ACCEPT_FAILURE_MESSAGES).sort()).toEqual([...FAILURES].sort());
    for (const failure of FAILURES) {
      expect(ACCEPT_FAILURE_MESSAGES[failure], failure).toBeTruthy();
    }
  });

  test("no two messages are the same — a shared 'this link doesn't work' is what criterion 4 refuses", () => {
    const messages = Object.values(ACCEPT_FAILURE_MESSAGES);
    expect(new Set(messages).size).toBe(messages.length);
  });

  test("the four gate words each tell the student something different to DO", () => {
    // Not merely different strings: different next actions. Expiry and revocation both end
    // at the counsellor, replay ends at "was that you?", mismatch ends at the address.
    expect(ACCEPT_FAILURE_MESSAGES.expired).toMatch(/expired/i);
    expect(ACCEPT_FAILURE_MESSAGES.revoked).toMatch(/withdrew/i);
    expect(ACCEPT_FAILURE_MESSAGES["already-accepted"]).toMatch(/already been used/i);
    expect(ACCEPT_FAILURE_MESSAGES["email-mismatch"]).toMatch(/different email address/i);
  });
});

describe("MV-194 criterion 4 — and none of them discloses anything", () => {
  test("no message names an address, an id, or the credential", () => {
    for (const [reason, message] of Object.entries(ACCEPT_FAILURE_MESSAGES)) {
      // An address in a refusal hands any token holder the invited student's address.
      expect(message, `${reason} carries an email address`).not.toMatch(/@/);
      // Ids belong in logs, not in a sentence a student reads.
      expect(message, `${reason} carries a uuid`).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      // "Token" is both a disclosure of mechanism and a word no student uses.
      expect(message, `${reason} says "token"`).not.toMatch(/\btoken\b/i);
    }
  });

  test("no message names a consultancy, a counsellor by name, or a case id", () => {
    for (const message of ALL_COPY) {
      expect(message).not.toMatch(/\bcase [0-9a-f]/i);
      expect(message).not.toMatch(/\borganization_id\b|\bcase_id\b/);
    }
  });
});

describe("MV-194 — the two half-done states say the link is spent, and do not say 'try again'", () => {
  test.each(["case-already-linked", "link-failed"] as const)("%s admits the link has been used", (reason) => {
    // The compare-and-swap committed, so the token IS spent and the student's next click
    // will be refused as a replay. "Try again" would walk them into that refusal and make
    // the product look broken twice for one fault.
    expect(ACCEPT_FAILURE_MESSAGES[reason]).toMatch(/has been used/i);
    expect(ACCEPT_FAILURE_MESSAGES[reason]).not.toMatch(/try again/i);
    // And each sends them somewhere a person can actually fix it.
    expect(ACCEPT_FAILURE_MESSAGES[reason]).toMatch(/consultancy/i);
  });

  test("`redeem-failed` DOES say try again — it is the one that is genuinely transient", () => {
    expect(ACCEPT_FAILURE_MESSAGES["redeem-failed"]).toMatch(/try again/i);
  });
});

describe("MV-194 criteria 5 and 6 — the founder decision, expressed as copy", () => {
  const confirmation = Object.values(ACCEPT_CONFIRMATION).join(" ");

  test("claims no transfer — a helpful 'we brought your profile over' is now a DEFECT", () => {
    for (const claim of [/brought (over|across)/i, /transferr?ed/i, /\bimported\b/i, /\bsynced\b/i, /\bmerged\b/i, /moved (over|across|into)/i]) {
      expect(confirmation, `the confirmation claims ${claim}`).not.toMatch(claim);
    }
  });

  test("implies no loss either — an empty consultancy case is not a bereavement", () => {
    for (const loss of [/\blost\b/i, /\bdeleted\b/i, /\bgone\b/i, /start(ing)? (again|from scratch)/i, /\bremoved\b/i]) {
      expect(confirmation, `the confirmation implies ${loss}`).not.toMatch(loss);
    }
  });

  test("says positively where the student's own work stayed", () => {
    // The obligation is not merely to avoid two wrong sentences; it is to say the true one.
    expect(ACCEPT_CONFIRMATION.separateCases).toMatch(/stay in your own account/i);
    expect(ACCEPT_CONFIRMATION.separateCases).toMatch(/nothing has been taken away/i);
  });

});

/**
 * MV-195 criterion 9 — the copy debt slice 3 pays.
 *
 * MV-194 wrote `dashboardNote` deliberately weak — "Your dashboard still shows your own
 * MeroVisa work, and that's where to find it" — because at the time there was nowhere else
 * to send the student, and promising the dashboard would show the consultancy's case "would
 * be a lie the student discovers one click later". The earlier version of this test pinned
 * that hedge by asserting the note said NOTHING about a consultancy.
 *
 * Slice 3 built the door, so the hedge is now the lie: a student who accepts and is told only
 * about their dashboard would never find the case they just accepted. The assertion is
 * therefore inverted rather than deleted — the sentence has to keep doing a job, and the job
 * changed.
 */
describe("MV-195 criterion 9 — the note now names a place that exists", () => {
  test("it points at the consultancy case AND still says where the student's own work is", () => {
    expect(ACCEPT_CONFIRMATION.dashboardNote).toMatch(/consultanc/i);
    expect(ACCEPT_CONFIRMATION.dashboardNote).toMatch(/your own MeroVisa work/i);
  });

  test("`separateCases` is NOT softened — it is the founder decision spoken to the student", () => {
    // Naming a second place to go is precisely when "nothing has been taken away from you"
    // is most load-bearing: it is the moment a student could conclude their work moved.
    expect(ACCEPT_CONFIRMATION.separateCases).toMatch(/stay in your own account/i);
    expect(ACCEPT_CONFIRMATION.separateCases).toMatch(/nothing has been taken away/i);
  });

  test("neither sentence implies the student's own data moved, nor that it was lost", () => {
    // The two describe blocks above already police this across the whole confirmation;
    // stated again here because criterion 9 names both halves explicitly, and because the
    // note is the string most likely to be reworded by whoever ships the next surface.
    const note = ACCEPT_CONFIRMATION.dashboardNote;
    for (const claim of [/brought (over|across)/i, /transferr?ed/i, /\bimported\b/i, /\bsynced\b/i, /\bmerged\b/i, /moved (over|across|into)/i]) {
      expect(note, `the note claims ${claim}`).not.toMatch(claim);
    }
    for (const loss of [/\blost\b/i, /\bdeleted\b/i, /\bgone\b/i, /start(ing)? (again|from scratch)/i, /\bremoved\b/i]) {
      expect(note, `the note implies ${loss}`).not.toMatch(loss);
    }
  });
});

describe("MV-194 decision B — the signed-out prompt discloses nothing", () => {
  const prompt = Object.values(ACCEPT_SIGN_IN_PROMPT).join(" ");

  test("says nothing about the invitation, the consultancy, or the case", () => {
    for (const leak of [/consultanc/i, /counsellor/i, /\bcase\b/i, /\binvitation\b/i, /\bexpire/i]) {
      expect(prompt, `the signed-out prompt mentions ${leak}`).not.toMatch(leak);
    }
  });

  test("is still actionable — 'leaks nothing' must not mean 'says nothing useful'", () => {
    expect(prompt).toMatch(/sign in/i);
    expect(prompt).toMatch(/email address/i);
  });
});

describe("MV-194 — house style", () => {
  test("sentence case throughout: no ALL-CAPS word outside the product name", () => {
    for (const message of ALL_COPY) {
      const shouty = message.match(/\b[A-Z]{2,}\b/g) ?? [];
      expect(shouty.filter((word) => word !== "MeroVisa"), message).toEqual([]);
    }
  });

  test("every string is a finished sentence or a button label, never a fragment ending in a colon", () => {
    for (const message of ALL_COPY) {
      expect(message.trim()).toBe(message);
      expect(message.endsWith(":"), message).toBe(false);
    }
  });
});
