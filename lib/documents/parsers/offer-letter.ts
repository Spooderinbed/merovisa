export interface OfferLetterResult {
  university: string | null;
  program: string | null;
  intake: string | null;
}

export function parseOfferLetter(text: string): OfferLetterResult | null {
  const uniMatch = text.match(/(?:university|institute|college)\s*(?:of\s*)?(.{3,80})/i);
  const programMatch = text.match(/(?:program|course|degree|bachelor|master)(?:\s*(?:of|in))?\s*(.{3,80})/i);
  const dateMatch = text.match(/(?:commenc|start|intake|begin)\w*\s*(?:date)?[:\s]*(.{5,40})/i);

  if (!uniMatch && !programMatch) return null;

  return {
    university: uniMatch ? uniMatch[1].trim() : null,
    program: programMatch ? programMatch[1].trim() : null,
    intake: dateMatch ? dateMatch[1].trim() : null,
  };
}
