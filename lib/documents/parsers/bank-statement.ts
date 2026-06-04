export interface BankStatementResult {
  balance: number;
  currency: string | null;
}

export function parseBankStatement(text: string): BankStatementResult | null {
  const balanceMatch = text.match(
    /(?:available\s*balance|closing\s*balance|current\s*balance|balance)[:\s]*(?:([A-Z]{3})\s*)?([0-9,]+\.?\d*)/i
  );
  if (!balanceMatch) return null;

  const amount = parseFloat(balanceMatch[2].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  const currencyMatch = text.match(/\b(NPR|AUD|USD|INR|BDT|PKR|NGN|NRs)\b/i);
  const currency = currencyMatch
    ? currencyMatch[1].toUpperCase().replace("NRS", "NPR")
    : balanceMatch[1]?.toUpperCase() ?? null;

  return { balance: amount, currency };
}
