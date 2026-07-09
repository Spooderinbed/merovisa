import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Wizard } from "@/components/wizard/wizard";

describe("Wizard SSR-stable shell (MV-118 #7 — no sessionStorage read in render)", () => {
  beforeEach(() => sessionStorage.clear());

  it("renders step 1 in a single render pass even when a later step is persisted", () => {
    sessionStorage.setItem(
      "myvisa.wizard.v1",
      JSON.stringify({ profile: { homeCountry: "Nepal", destination: "australia" }, index: 2 }),
    );
    // renderToStaticMarkup runs the render body with NO effects — the SSR / first
    // client render must start at step 1 regardless of the persisted position.
    const html = renderToStaticMarkup(<Wizard onComplete={() => {}} persist />);
    expect(html).toContain("Step 1 of"); // stable step-1 shell (server + first client render)
    expect(html).not.toContain("Step 3 of"); // must NOT restore index 2 during render
  });
});
