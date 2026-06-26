import { describe, it, expect } from "vitest";
import { GUIDE_SYSTEM_PROMPT } from "@/lib/guide/system-prompt";

// The system prompt IS the trust boundary for the AI guide — these assertions pin the
// guardrails so a careless copy edit can't quietly remove one.
describe("GUIDE_SYSTEM_PROMPT", () => {
  it("encodes the explain-not-decide framing over the rule-based engine", () => {
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/explain/i);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/rule-based/i);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/not to decide|never decide|do not decide/i);
  });

  it("forbids fabrication and requires grounding in the supplied context + sources", () => {
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/never invent|do not invent/i);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/source/i);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/don.t have that information|not in that context|not in the context/i);
  });

  it("refuses to write the student's application, on genuine-student grounds", () => {
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/statement of purpose|application/i);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/genuine/i);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/never write|do not write|decline/i);
  });

  it("stays inside the Nepal→Australia corridor", () => {
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/Nepal/);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/Australia/);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/only covers|only Nepal/i);
  });

  it("uses banded verdicts, never a percentage or score", () => {
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/Strong match/);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/Possible/);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/Reach/);
    expect(GUIDE_SYSTEM_PROMPT).toMatch(/never a percentage|not a percentage/i);
  });
});
