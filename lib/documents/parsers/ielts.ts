export interface IeltsResult {
  overall: number;
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
}

export function parseIelts(text: string): IeltsResult | null {
  const normalized = text.replace(/[|)(}\]{\[]/g, " ").replace(/\s+/g, " ");

  const overall = extractBandScore(normalized, /overall\s*band\s*score[:\s]+(\d+\.?\d*)/i)
    ?? extractBandScore(normalized, /overall\s*score[:\s]+(\d+\.?\d*)/i)
    ?? extractBandScore(normalized, /band\s*score[:\s]+(\d+\.?\d*)/i)
    ?? extractBandScore(normalized, /band[:\s]+(\d+\.?\d*)/i)
    ?? extractBandScore(normalized, /overall[:\s]+(\d+\.?\d*)/i);

  const listening = extractBandScore(normalized, /listening[:\s]+(\d+\.?\d*)/i);
  const reading = extractBandScore(normalized, /reading[:\s]+(\d+\.?\d*)/i);
  const writing = extractBandScore(normalized, /writing[:\s]+(\d+\.?\d*)/i);
  const speaking = extractBandScore(normalized, /speaking[:\s]+(\d+\.?\d*)/i);

  if (overall == null) return null;

  return {
    overall,
    listening: listening ?? overall,
    reading: reading ?? overall,
    writing: writing ?? overall,
    speaking: speaking ?? overall,
  };
}

function extractBandScore(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m || m[1] === undefined) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n) || n < 0 || n > 9) return null;
  return n;
}
