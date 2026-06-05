import type { NepalBank } from "../types";
import { NEPAL_BANKS } from "./nepal-banks";

export function getNepalBanks(): NepalBank[] {
  return NEPAL_BANKS;
}

export function getEducationLoanBanks(): NepalBank[] {
  return NEPAL_BANKS.filter((b) => b.educationLoan);
}
