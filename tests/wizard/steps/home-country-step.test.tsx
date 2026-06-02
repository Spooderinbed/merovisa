import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeCountryStep } from "@/components/wizard/steps/home-country-step";

describe("HomeCountryStep", () => {
  it("sets homeCountry and the matching grade system on select", async () => {
    const setField = vi.fn();
    render(<HomeCountryStep profile={{ homeCountry: "Nepal" }} setField={setField} callouts={null} />);
    await userEvent.click(screen.getByRole("radio", { name: /India/ }));
    expect(setField).toHaveBeenCalledWith({ homeCountry: "India", gradeSystem: "percentage-india" });
  });
});
