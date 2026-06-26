import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkingWithAgents } from "@/components/results/working-with-agents";

describe("WorkingWithAgents", () => {
  it("renders the eyebrow and five section headings", () => {
    render(<WorkingWithAgents />);
    expect(screen.getByText("Working with an agent (Australia)")).toBeInTheDocument();
    expect(screen.getByText("Do you need an agent?")).toBeInTheDocument();
    expect(screen.getByText("Check the register first")).toBeInTheDocument();
    expect(screen.getByText("What your agent owes you")).toBeInTheDocument();
    expect(screen.getByText("Formal representation")).toBeInTheDocument();
    expect(screen.getByText("The 2026 commission ban")).toBeInTheDocument();
  });

  it("copy-locks the four trust-sensitive lines verbatim", () => {
    render(<WorkingWithAgents />);
    expect(
      screen.getByText(
        'Immigration assistance can only be given by registered migration agents, Australian legal practitioners, or limited "exempt persons".',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Education providers cannot pay agent commissions when a student switches providers in Australia before finishing their principal course (transfers after 31 March 2026).",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The government warned that direct payments to agents for transfers could expose students to exploitation.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "General context on migration assistance and education-agent commissions for Australia, not legal advice.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces the three gov depth rows verbatim (G.078, G.082, G.095)", () => {
    render(<WorkingWithAgents />);
    expect(
      screen.getByText(
        "No MARN to hand? You can also search the OMARA public register by the agent's business location.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "An authorised recipient only receives your mail — they must not give immigration assistance unless they're also a registered agent, legal practitioner, or exempt person.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The same analysis estimates students who still use an agent for a transfer may pay around AUD 255 per enrolment.",
      ),
    ).toBeInTheDocument();
  });

  it("links rows to their government sources", () => {
    render(<WorkingWithAgents />);
    expect(screen.getAllByRole("link", { name: "OMARA register" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("portal.mara.gov.au"),
    );
    expect(screen.getByRole("link", { name: "Study Australia" })).toHaveAttribute(
      "href",
      expect.stringContaining("studyaustralia.gov.au"),
    );
    expect(screen.getAllByRole("link", { name: "Form 956" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("956.pdf"),
    );
    expect(screen.getAllByRole("link", { name: "Impact analysis" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("oia.pmc.gov.au"),
    );
  });

  it("renders the first section open and the rest collapsed", () => {
    const { container } = render(<WorkingWithAgents />);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(5);
    expect(details[0]?.hasAttribute("open")).toBe(true);
    expect(details[1]?.hasAttribute("open")).toBe(false);
  });
});
