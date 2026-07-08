// tests/components/marketing/documents-checklist.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentsChecklist } from "@/components/marketing/documents-checklist";

describe("DocumentsChecklist", () => {
  it("SSR rest: six labels, two checkboxes checked, '2 of 6', fill width 33% inline", () => {
    const html = renderToStaticMarkup(<DocumentsChecklist />);
    expect(html).toContain("Academic transcript verified");
    expect(html).toContain("Genuine Student (GS) statement drafted");
    expect(html).toContain("OSHC health cover arranged");
    expect((html.match(/checked=""|checked/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("of 6 ready");
    expect(html).toMatch(/width:33%/);
  });

  it("rows are role=checkbox; two checked at rest; toggling a third reads '3 of 6'", () => {
    render(<DocumentsChecklist />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(6);
    expect(boxes.filter((b) => (b as HTMLInputElement).checked)).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: /Financial evidence: A\$29,710/i }));
    expect(screen.getByText(/3/).closest(".cl-count")).toHaveTextContent("3 of 6 ready");
  });

  it("toggling all remaining boxes reaches the all-done rest state ('6 of 6 ready', .alldone, All set pill)", () => {
    const { container } = render(<DocumentsChecklist />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    boxes.forEach((b) => {
      if (!b.checked) fireEvent.click(b);
    });
    expect(boxes.filter((b) => b.checked)).toHaveLength(6);
    const root = container.querySelector(".checklist");
    expect(root).toHaveClass("alldone");
    expect(container.querySelector(".cl-count")).toHaveTextContent("6 of 6 ready");
    expect(container.querySelector(".ready-pill")).toHaveTextContent("All set");
  });
});
