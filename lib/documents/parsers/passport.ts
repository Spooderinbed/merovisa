export interface PassportResult {
  name: string;
  dob: string; // ISO format YYYY-MM-DD
}

export function parsePassport(text: string): PassportResult | null {
  const nameMatch = text.match(/(?:surname|family\s*name)[:\s]*([A-Z][A-Z ]+)/i);
  const givenMatch = text.match(/(?:given\s*name|first\s*name|prenom)[:\s]*([A-Z][A-Z ]+)/i);

  const givenName = givenMatch?.[1]?.trim();
  const familyName = nameMatch?.[1]?.trim();
  const name =
    givenName && familyName
      ? `${givenName} ${familyName}`
      : null;

  const dobMatch = text.match(
    /(?:date\s*of\s*birth|birth\s*date|d\.o\.b|dob)[:\s]*(\d{1,2}[\s/.-]\d{1,2}[\s/.-]\d{2,4})/i
  );
  if (!name || !dobMatch) return null;

  const rawDob = dobMatch[1];
  if (rawDob === undefined) return null;
  const dob = normalizeDateToIso(rawDob);
  if (!dob) return null;

  return { name, dob };
}

function normalizeDateToIso(raw: string): string | null {
  const parts = raw.split(/[\s/.-]+/);
  if (parts.length !== 3) return null;
  const nums = parts.map(Number);
  let a = nums[0] ?? 0;
  let b = nums[1] ?? 0;
  let c = nums[2] ?? 0;
  if (c < 100) c += 1900 + (c > 50 ? 0 : 100);
  // Assume DD/MM/YYYY (most passport formats)
  const day = a,
    month = b,
    year = c;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1920 || year > 2025) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
