export interface ToeflResult {
  overall: number;
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
}

export function parseToefl(text: string): ToeflResult | null {
  const overall = extractToeflScore(text, /total\s*(?:score)?[:\s]*(\d+)/i);
  if (overall == null) return null;

  const listening = extractToeflScore(text, /listening[:\s]*(\d+)/i, 30);
  const reading = extractToeflScore(text, /reading[:\s]*(\d+)/i, 30);
  const writing = extractToeflScore(text, /writing[:\s]*(\d+)/i, 30);
  const speaking = extractToeflScore(text, /speaking[:\s]*(\d+)/i, 30);

  if (listening == null || reading == null || writing == null || speaking == null) return null;
  return { overall, listening, reading, writing, speaking };
}

function extractToeflScore(text: string, pattern: RegExp, max = 120): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return isNaN(n) || n < 0 || n > max ? null : n;
}
