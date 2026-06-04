import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ChecklistPage from "@/app/(app)/checklist/page";
import GuidePage from "@/app/(app)/guide/page";

const cases: Array<[string, React.ComponentType, RegExp, RegExp]> = [
  ["checklist", ChecklistPage, /Checklist landing in Phase 5/i, /document/i],
  ["guide",   GuidePage,     /Guide landing in Phase 6/i, /AI guide/i],
];

describe("(app) stub pages", () => {
  for (const [name, Comp, headline, body] of cases) {
    it(`${name} renders headline + body + back link`, () => {
      render(<Comp />);
      expect(screen.getByText(headline)).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Back to dashboard/i })).toHaveAttribute("href", "/dashboard");
    });
  }
});
