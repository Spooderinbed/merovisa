export interface PteResult {
  overall: number;
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
}

export function parsePte(text: string): PteResult | null {
  const overall = extractPteScore(text, /overall\s*(?:score)?[:\s]*(\d+)/i);
  if (overall == null) return null;

  const listening = extractPteScore(text, /listening[:\s]*(\d+)/i);
  const reading = extractPteScore(text, /reading[:\s]*(\d+)/i);
  const writing = extractPteScore(text, /writing[:\s]*(\d+)/i);
  const speaking = extractPteScore(text, /speaking[:\s]*(\d+)/i);

  if (listening == null || reading == null || writing == null || speaking == null) return null;
  return { overall, listening, reading, writing, speaking };
}

function extractPteScore(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  const raw = m[1];
  if (raw === undefined) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 10 || n > 90 ? null : n;
}
