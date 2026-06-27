import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeCountryStep } from "@/components/wizard/steps/home-country-step";

describe("HomeCountryStep", () => {
  it("offers Nepal inside a labelled radiogroup and selects it with percentage-nepal", async () => {
    const setField = vi.fn();
    render(<HomeCountryStep profile={{ homeCountry: "Nepal" }} setField={setField} callouts={null} eyebrow="Step 1" />);
    const group = screen.getByRole("radiogroup", { name: /Home country/i });
    expect(group).toBeInTheDocument();
    const nepal = screen.getByRole("radio", { name: /Nepal/ });
    expect(nepal).toHaveAttribute("aria-checked", "true");
    await userEvent.click(nepal);
    expect(setField).toHaveBeenCalledWith({ homeCountry: "Nepal", gradeSystem: "percentage-nepal" });
  });

  it("notes that more countries are coming soon", () => {
    render(<HomeCountryStep profile={{ homeCountry: "Nepal" }} setField={vi.fn()} callouts={null} eyebrow="Step 1" />);
    expect(screen.getByText(/More countries coming soon: India/i)).toBeInTheDocument();
  });
});
