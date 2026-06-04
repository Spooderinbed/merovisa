export interface SalarySlipResult {
  amount: number;
  employer: string | null;
}

export function parseSalarySlip(text: string): SalarySlipResult | null {
  // Prefer net/take-home over gross; fall back to gross/total if net absent
  const netMatch = text.match(
    /(?:net\s*pay|take\s*home)[:\s]*(?:[A-Z]{2,3}\s*)?([0-9,]+\.?\d*)/i
  );
  const grossMatch = text.match(
    /(?:gross\s*(?:pay|salary)|total\s*(?:earnings|salary))[:\s]*(?:[A-Z]{2,3}\s*)?([0-9,]+\.?\d*)/i
  );
  const payMatch = netMatch ?? grossMatch;
  if (!payMatch) return null;

  const amount = parseFloat(payMatch[1].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  const employerMatch = text.match(/(?:company|employer|organization)[:\s]*(.{2,80})/i);

  return {
    amount,
    employer: employerMatch ? employerMatch[1].trim() : null,
  };
}
