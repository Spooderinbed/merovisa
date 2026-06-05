import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { BankLoanPanel } from "@/components/profile/editors/bank-loan-panel";
import { FinanceEditor } from "@/components/profile/editors/finance-editor";

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

describe("FinanceEditor education-loan surface", () => {
  it("hides the bank panel until education-loan is selected", () => {
    render(<FinanceEditor initial={{}} />);
    expect(screen.queryByText(/Class-A banks with education loans/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Source of funds/i), { target: { value: "education-loan" } });
    expect(screen.getByText(/Class-A banks with education loans/i)).toBeInTheDocument();
  });
});
