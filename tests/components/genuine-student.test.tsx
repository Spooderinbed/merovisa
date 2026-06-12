import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenuineStudent } from "@/components/results/genuine-student";

describe("GenuineStudent", () => {
  it("renders the five section headings", () => {
    render(<GenuineStudent />);
    expect(screen.getByText("The Genuine Student test (Australia)")).toBeInTheDocument();
    expect(screen.getByText("What it is")).toBeInTheDocument();
    expect(screen.getByText("The questions you'll answer")).toBeInTheDocument();
    expect(screen.getByText("How officers actually weigh it")).toBeInTheDocument();
    expect(screen.getByText("Post-study honesty")).toBeInTheDocument();
    expect(screen.getByText("Evidence & what not to trust")).toBeInTheDocument();
  });

  it("copy-locks the two trust-sensitive lines verbatim", () => {
    render(<GenuineStudent />);
    expect(
      screen.getByText(
        "Wanting to apply for permanent residence later does not count against you — as long as your study plan and stay are genuine under the visa rules. Post-study pathways exist, but only for those who are eligible.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("General context for the Australian Genuine Student requirement, not legal advice."),
    ).toBeInTheDocument();
  });

  it("shows all four GS form questions, including the open one (read-through F3)", () => {
    render(<GenuineStudent />);
    expect(
      screen.getByText(
        "Anything else you think matters — the form ends with an open question for any other relevant information.",
      ),
    ).toBeInTheDocument();
  });

  it("links rows to their government sources", () => {
    render(<GenuineStudent />);
    expect(screen.getAllByRole("link", { name: "Direction 106" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("direction-no-106.pdf"),
    );
    expect(screen.getByRole("link", { name: "Study Australia" })).toHaveAttribute(
      "href",
      expect.stringContaining("studyaustralia.gov.au"),
    );
    expect(screen.getByRole("link", { name: "Subclass 485" })).toHaveAttribute(
      "href",
      expect.stringContaining("temporary-graduate-485"),
    );
  });

  it("renders the first section open and the rest collapsed", () => {
    const { container } = render(<GenuineStudent />);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(5);
    expect(details[0]?.hasAttribute("open")).toBe(true);
    expect(details[1]?.hasAttribute("open")).toBe(false);
  });
});
