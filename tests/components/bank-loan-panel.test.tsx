import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BankLoanPanel } from "@/components/profile/editors/bank-loan-panel";
import { MoneyScholarshipsEditor } from "@/components/profile/editors/money-scholarships-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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

  it("renders loan pricing for both base-spread and fixed lenders", () => {
    render(<BankLoanPanel />);
    // Himalayan: base-spread (Base + 0.5–2.5%)
    expect(screen.getByText(/Base \+ 0\.5/)).toBeInTheDocument();
    // NIC Asia: fixed effective rate (8.99% fixed)
    expect(screen.getByText(/8\.99% fixed/)).toBeInTheDocument();
  });
});

describe("MoneyScholarshipsEditor education-loan surface", () => {
  it("hides the bank panel until education-loan is selected", () => {
    render(<MoneyScholarshipsEditor initial={{}} />);
    expect(screen.queryByText(/Class-A banks with education loans/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Source of funds/i), { target: { value: "education-loan" } });
    expect(screen.getByText(/Class-A banks with education loans/i)).toBeInTheDocument();
  });
});
