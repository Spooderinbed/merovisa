import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserPill } from "@/components/layout/user-pill";

const mkUser = (overrides: Record<string, unknown> = {}) => ({
  id: "u1", email: "aarav@example.com",
  user_metadata: { full_name: "Aarav Sharma" },
  ...overrides,
} as never);

describe("UserPill", () => {
  it("renders initials computed from full name", () => {
    render(<UserPill user={mkUser()} />);
    expect(screen.getByTestId("user-pill")).toHaveTextContent("AS");
  });

  it("falls back to email initial when no name", () => {
    render(<UserPill user={mkUser({ user_metadata: {} })} />);
    expect(screen.getByTestId("user-pill")).toHaveTextContent("A");
  });

  it("expands a menu on click with Dashboard / Profile / Sign out", async () => {
    render(<UserPill user={mkUser()} />);
    await userEvent.click(screen.getByTestId("user-pill"));
    expect(screen.getByRole("link", { name: /Dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Profile/i })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: /Sign out/i })).toBeInTheDocument();
  });

  it("Sign out submits a POST form to /auth/signout", async () => {
    render(<UserPill user={mkUser()} />);
    await userEvent.click(screen.getByTestId("user-pill"));
    const form = screen.getByTestId("signout-form");
    expect(form).toHaveAttribute("action", "/auth/signout");
    expect(form).toHaveAttribute("method", "post");
  });
});
