import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FieldCoverageNotice } from "@/components/results/field-coverage-notice";

describe("FieldCoverageNotice", () => {
  it("names the uncovered field with its human label and says we don't list it yet", () => {
    const { container } = render(<FieldCoverageNotice field="law" />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/don.t list/i);
    expect(text).toMatch(/Law/);
    // Makes plain the programs shown belong to other fields, not the student's.
    expect(text).toMatch(/other fields/i);
  });

  it("uses a reference-only framing for 'other', which can never be covered", () => {
    const { container } = render(<FieldCoverageNotice field="other" />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/reference/i);
    expect(text).toMatch(/can.t match/i);
  });

  it("uses no fear or dead-end language", () => {
    const { container } = render(<FieldCoverageNotice field="law" />);
    expect(container.textContent ?? "").not.toMatch(
      /can't study|impossible|reject|not eligible|give up|dead end/i,
    );
  });

  it("renders nothing when the field is covered (null/undefined)", () => {
    const { container: a } = render(<FieldCoverageNotice field={null} />);
    expect(a.firstChild).toBeNull();
    const { container: b } = render(<FieldCoverageNotice field={undefined} />);
    expect(b.firstChild).toBeNull();
  });
});
