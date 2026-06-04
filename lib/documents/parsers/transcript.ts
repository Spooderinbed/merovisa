export interface TranscriptResult {
  institution: string | null;
  degree: string | null;
  gradePercent: number | null;
}

export function parseTranscript(text: string): TranscriptResult | null {
  const gpaMatch = text.match(/(?:gpa|cgpa|grade\s*point)[:\s]*(\d+\.?\d*)\s*(?:\/\s*(\d+\.?\d*))?/i);
  const pctMatch = text.match(/(?:percentage|percent|total\s*marks)[:\s]*(\d+\.?\d*)\s*%?/i);

  let gradePercent: number | null = null;
  if (gpaMatch) {
    const gpa = parseFloat(gpaMatch[1]);
    const scale = gpaMatch[2] ? parseFloat(gpaMatch[2]) : 4.0;
    gradePercent = Math.round((gpa / scale) * 100);
  } else if (pctMatch) {
    gradePercent = parseFloat(pctMatch[1]);
  }

  if (gradePercent == null || gradePercent < 0 || gradePercent > 100) return null;

  const instMatch = text.match(/([^\n\r]{3,80}(?:university|institute|college|school)[^\n\r]{0,60})/i);
  const degreeMatch = text.match(/(?:bachelor|master|diploma|certificate|b\.?\s*(?:sc|a|tech|e)|m\.?\s*(?:sc|a|tech|e))/i);

  return {
    institution: instMatch ? instMatch[1].trim() : null,
    degree: degreeMatch ? normalizeDegree(degreeMatch[0]) : null,
    gradePercent,
  };
}

function normalizeDegree(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("master") || lower.startsWith("m.") || lower.startsWith("m ")) return "masters";
  if (lower.includes("bachelor") || lower.startsWith("b.") || lower.startsWith("b ")) return "bachelors";
  return "bachelors";
}
