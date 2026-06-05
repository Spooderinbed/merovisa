import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BankLoanPanel } from "@/components/profile/editors/bank-loan-panel";

describe("BankLoanPanel", () => {
  it("lists education-loan banks with their amount ceiling", () => {
    render(<BankLoanPanel />);
    expect(screen.getByText(/Himalayan Bank/i)).toBeInTheDocument();
    // NPR 10,000,000 ceiling formatted with separators
    expect(screen.getAllByText(/10,000,000/).length).toBeGreaterThan(0);
  });

  it("renders a sourced footnote, not an unsourced claim", () => {
    render(<BankLoanPanel />);
    expect(screen.getByText(/Nepal Rastra Bank/i)).toBeInTheDocument();
  });
});
