import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Eyebrow } from "@/components/marketing/eyebrow";

describe("Eyebrow", () => {
  it("renders its label uppercased in mono style", () => {
    render(<Eyebrow>For students applying abroad</Eyebrow>);
    const el = screen.getByText(/for students applying abroad/i);
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass("font-mono");
  });
});
