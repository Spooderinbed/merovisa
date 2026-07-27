import "server-only";
import crypto from "crypto";

function getSecret(): string {
  const s = process.env.CLAIM_HMAC_SECRET;
  if (!s || s.length < 32) {
    throw new Error("CLAIM_HMAC_SECRET must be set to a 32+ char random secret");
  }
  return s;
}

/** How long a freshly signed claim token stays usable. */
export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Produce a signed claim token: `<assessmentId>.<expiresAt>.<sig>`
 * Signature is HMAC-SHA256 over `<assessmentId>.<expiresAt>`.
 */
export function signClaim(assessmentId: string, expiresAt: number): string {
  if (!/^[0-9a-f-]{36}$/.test(assessmentId)) {
    throw new Error("assessmentId must be a UUID");
  }
  const payload = `${assessmentId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyClaim(token: string): { assessmentId: string } | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [assessmentId, expiresStr, sig] = parts;
  if (!assessmentId || !expiresStr || !sig) return null;
  if (!/^[0-9a-f-]{36}$/.test(assessmentId)) return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(`${assessmentId}.${expiresStr}`)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return { assessmentId };
}
