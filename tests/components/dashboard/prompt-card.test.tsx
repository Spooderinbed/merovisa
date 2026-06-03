import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PromptCard } from "@/components/dashboard/prompt-card";

describe("PromptCard", () => {
  it("renders the IELTS prompt with a CTA when reportUploaded is false", () => {
    render(<PromptCard kind="ielts-missing" />);
    expect(screen.getByText(/Upload your IELTS report/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add details/i })).toHaveAttribute("href", "/profile");
  });

  it("renders a generic next-best-step card when kind is profile-incomplete", () => {
    render(<PromptCard kind="profile-incomplete" />);
    expect(screen.getByText(/Your next best step/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add details/i })).toHaveAttribute("href", "/profile");
  });

  it("renders empty state when kind is none", () => {
    render(<PromptCard kind="none" />);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
  });
});
