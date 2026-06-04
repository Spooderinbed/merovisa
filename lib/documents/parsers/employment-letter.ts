export interface EmploymentLetterResult {
  title: string | null;
  employer: string | null;
  years: number | null;
}

export function parseEmploymentLetter(text: string): EmploymentLetterResult | null {
  const titleMatch = text.match(/(?:position|designation|role|employed\s*as)[:\s]*(.{2,80})/i);
  const employerMatch = text.match(/(?:company|organization|employer|firm)[:\s]*(.{2,80})/i);
  const yearsMatch = text.match(/(\d+)\s*(?:years?|yrs?)/i);
  const sinceMatch = text.match(/since\s*(\d{4})/i);

  if (!titleMatch && !yearsMatch && !sinceMatch) return null;

  let years: number | null = null;
  if (yearsMatch) {
    years = parseInt(yearsMatch[1], 10);
  } else if (sinceMatch) {
    years = new Date().getFullYear() - parseInt(sinceMatch[1], 10);
  }

  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    employer: employerMatch ? employerMatch[1].trim() : null,
    years: years != null && years >= 0 && years <= 40 ? years : null,
  };
}
