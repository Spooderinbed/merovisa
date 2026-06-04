export interface IeltsResult {
  overall: number;
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
}

export function parseIelts(text: string): IeltsResult | null {
  const overall = extractScore(text, /overall\s*(?:band\s*)?score[:\s]*(\d+\.?\d*)/i);
  if (overall == null) return null;

  const listening = extractScore(text, /listening[:\s]*(\d+\.?\d*)/i);
  const reading = extractScore(text, /reading[:\s]*(\d+\.?\d*)/i);
  const writing = extractScore(text, /writing[:\s]*(\d+\.?\d*)/i);
  const speaking = extractScore(text, /speaking[:\s]*(\d+\.?\d*)/i);

  if (listening == null || reading == null || writing == null || speaking == null) return null;
  return { overall, listening, reading, writing, speaking };
}

function extractScore(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isNaN(n) || n < 0 || n > 9 ? null : n;
}
