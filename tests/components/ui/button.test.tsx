import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

/**
 * MV-91 — the Button `loading` contract (audit #13). The primitive owns the
 * in-flight state so call sites can't drift (document-card once said "Uploading…"
 * on one button and "Loading..." on another). Loading => disabled + aria-busy +
 * one canonical mono ellipsis, with the label excluded from neither.
 */
describe("Button loading contract (MV-91)", () => {
  it("idle: type=button, not disabled, no aria-busy, plain children, no ellipsis", () => {
    render(<Button>Upload</Button>);
    const btn = screen.getByRole("button", { name: "Upload" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
    expect(btn.textContent).toBe("Upload");
    expect(btn.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("loading: disables and sets aria-busy=\"true\"", () => {
    render(<Button loading>Upload</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("loading: renders loadingLabel + a font-mono aria-hidden ellipsis", () => {
    render(
      <Button loading loadingLabel="Uploading">
        Upload
      </Button>,
    );
    const btn = screen.getByRole("button");
    // Accessible name excludes the aria-hidden ellipsis — it reads "Uploading".
    expect(btn).toHaveAccessibleName("Uploading");
    // Full text content includes the single canonical ellipsis character.
    expect(btn.textContent).toBe("Uploading…");
    const ellipsis = btn.querySelector('[aria-hidden="true"]');
    expect(ellipsis).not.toBeNull();
    expect(ellipsis).toHaveClass("font-mono");
    expect(ellipsis?.textContent).toBe("…");
  });

  it("loading with no loadingLabel falls back to children", () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole("button").textContent).toBe("Save…");
  });

  it("loading forces disabled even when disabled is not passed", () => {
    render(<Button loading>Go</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("still composes variant, size, and a trailing className", () => {
    render(
      <Button variant="ghost" size="sm" className="w-full">
        Go
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("w-full"); // caller class survives
    expect(btn).toHaveClass("border-line-2"); // ghost variant
    expect(btn).toHaveClass("text-meta"); // sm size
  });

  it("idle ellipsis is never emitted regardless of a loadingLabel being present", () => {
    render(
      <Button loadingLabel="Uploading">Upload</Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn.textContent).toBe("Upload");
    expect(btn.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
