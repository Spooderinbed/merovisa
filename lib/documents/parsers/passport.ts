export interface PassportResult {
  name: string;
  dob: string; // ISO format YYYY-MM-DD
}

export function parsePassport(text: string): PassportResult | null {
  const nameMatch = text.match(/(?:surname|family\s*name)[:\s]*([A-Z][A-Z ]+)/i);
  const givenMatch = text.match(/(?:given\s*name|first\s*name|prenom)[:\s]*([A-Z][A-Z ]+)/i);

  const name =
    nameMatch && givenMatch
      ? `${givenMatch[1].trim()} ${nameMatch[1].trim()}`
      : null;

  const dobMatch = text.match(
    /(?:date\s*of\s*birth|birth\s*date|d\.o\.b|dob)[:\s]*(\d{1,2}[\s/.-]\d{1,2}[\s/.-]\d{2,4})/i
  );
  if (!name || !dobMatch) return null;

  const dob = normalizeDateToIso(dobMatch[1]);
  if (!dob) return null;

  return { name, dob };
}

function normalizeDateToIso(raw: string): string | null {
  const parts = raw.split(/[\s/.-]+/);
  if (parts.length !== 3) return null;
  let [a, b, c] = parts.map(Number);
  if (c < 100) c += 1900 + (c > 50 ? 0 : 100);
  // Assume DD/MM/YYYY (most passport formats)
  const day = a,
    month = b,
    year = c;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1920 || year > 2025) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
