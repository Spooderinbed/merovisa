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
    const rawYears = yearsMatch[1];
    if (rawYears !== undefined) years = parseInt(rawYears, 10);
  } else if (sinceMatch) {
    const rawSince = sinceMatch[1];
    if (rawSince !== undefined) years = new Date().getFullYear() - parseInt(rawSince, 10);
  }

  return {
    title: titleMatch?.[1]?.trim() ?? null,
    employer: employerMatch?.[1]?.trim() ?? null,
    years: years != null && years >= 0 && years <= 40 ? years : null,
  };
}
