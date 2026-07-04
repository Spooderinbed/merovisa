import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "@/components/ui/card";

describe("Card", () => {
  it("renders the default panel shell exactly — the app's dominant card string", () => {
    render(<Card data-testid="c">hello</Card>);
    expect(screen.getByTestId("c").className).toBe("rounded-lg border border-line bg-surface");
  });

  it("renders a div by default and the given element via `as`", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstElementChild?.tagName).toBe("DIV");
    render(
      <Card as="section" aria-label="panel">
        y
      </Card>,
    );
    expect(screen.getByRole("region", { name: "panel" }).tagName).toBe("SECTION");
  });

  it("maps radius roles onto the app radius scale (card = rounded-md 12px, panel = rounded-lg 16px)", () => {
    render(<Card data-testid="r-card" radius="card" />);
    render(<Card data-testid="r-panel" radius="panel" />);
    expect(screen.getByTestId("r-card")).toHaveClass("rounded-md");
    expect(screen.getByTestId("r-card")).not.toHaveClass("rounded-lg");
    expect(screen.getByTestId("r-panel")).toHaveClass("rounded-lg");
  });

  it("supports the tint tone", () => {
    render(<Card data-testid="tint" tone="tint" />);
    expect(screen.getByTestId("tint")).toHaveClass("bg-bg-tint");
    expect(screen.getByTestId("tint")).not.toHaveClass("bg-surface");
  });

  it("reproduces the primary CTA shell exactly", () => {
    render(<Card data-testid="cta" tone="primary" border="transparent" padding="lg" />);
    expect(screen.getByTestId("cta").className).toBe(
      "rounded-lg border border-transparent bg-primary text-on-primary p-6",
    );
  });

  it("supports the line-2 border variant", () => {
    render(<Card data-testid="b2" border="line-2" />);
    expect(screen.getByTestId("b2")).toHaveClass("border-line-2");
    expect(screen.getByTestId("b2")).not.toHaveClass("border-line");
  });

  it("maps padding variants sm/md/lg to p-4/p-5/p-6 and omits padding by default", () => {
    render(<Card data-testid="p0" />);
    render(<Card data-testid="p4" padding="sm" />);
    render(<Card data-testid="p5" padding="md" />);
    render(<Card data-testid="p6" padding="lg" />);
    expect(screen.getByTestId("p0").className).not.toMatch(/\bp-\d/);
    expect(screen.getByTestId("p4")).toHaveClass("p-4");
    expect(screen.getByTestId("p5")).toHaveClass("p-5");
    expect(screen.getByTestId("p6")).toHaveClass("p-6");
  });

  it("appends className after the shell so call sites keep their layout/extras", () => {
    render(<Card data-testid="x" padding="md" className="flex flex-col gap-3" />);
    expect(screen.getByTestId("x").className).toBe(
      "rounded-lg border border-line bg-surface p-5 flex flex-col gap-3",
    );
  });

  it("passes arbitrary props through to the rendered element", () => {
    render(
      <Card as="a" href="/plan" data-testid="link">
        go
      </Card>,
    );
    expect(screen.getByTestId("link")).toHaveAttribute("href", "/plan");
  });
});
