import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineCallout } from "@/components/ui/inline-callout";

describe("InlineCallout", () => {
  it("renders the message and an action link when provided", () => {
    render(
      <InlineCallout
        callout={{
          id: "ielts-low-au",
          step: "english",
          tone: "warn",
          message: "Most Australian universities require 6.5+.",
          actionLabel: "Find test dates",
          actionHref: "https://example.com",
        }}
      />,
    );
    expect(screen.getByText(/require 6\.5\+/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Find test dates/ });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders no link when actionHref is absent", () => {
    render(<InlineCallout callout={{ id: "x", step: "english", tone: "info", message: "Hi" }} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
