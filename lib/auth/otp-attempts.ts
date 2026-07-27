import "server-only";
import { getRedis } from "@/lib/rate-limit/upstash";

/**
 * Wrong guesses a single emailed code survives before it is retired.
 *
 * Both the app's verify limit and GoTrue's own are per-IP, so a rotating IP pool
 * could otherwise spend the code's whole one-hour life guessing — roughly 500k
 * attempts against a 1,000,000 keyspace, on the only credential an email-auth
 * account has. Counting per address instead caps a code at MAX_OTP_ATTEMPTS
 * guesses, and the send endpoint already caps codes at 5 per address per hour:
 * 25 guesses an hour, which is nowhere near six digits.
 *
 * Deliberately NOT an address lockout. The count is scoped to one code and wiped
 * whenever a new one is sent, so burning a code can never park a student outside
 * their own account — "send a new code" is always open to them. The emailed link
 * is unaffected either way: its token hash is far too large to guess.
 */
export const MAX_OTP_ATTEMPTS = 5;

/** Matches `otp_expiry` in supabase/config.toml — the counter dies with its code. */
const TTL_SECONDS = 60 * 60;

const keyFor = (email: string) => `mv:otp-attempts:${email}`;

/**
 * Every function here fails OPEN. Email OTP is the sole credential for these
 * accounts, so refusing all sign-ins while Redis is unreachable would be a worse
 * outage than the brute-force exposure it guards. Same posture as checkRateLimit.
 */
export async function failedOtpAttempts(email: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const value = await redis.get<number | string>(keyFor(email));
    return Number(value ?? 0) || 0;
  } catch (e) {
    console.error("[otp-attempts] read failed, allowing attempt:", e);
    return 0;
  }
}

/** Records one wrong guess. Returns the running count for this code. */
export async function recordFailedOtpAttempt(email: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const count = await redis.incr(keyFor(email));
    // Only the first failure needs the TTL; re-setting it on every miss would let
    // an attacker keep the counter alive indefinitely by guessing slowly.
    if (count === 1) await redis.expire(keyFor(email), TTL_SECONDS);
    return count;
  } catch (e) {
    console.error("[otp-attempts] increment failed, allowing attempt:", e);
    return 0;
  }
}

/** Wipes the count — called when a fresh code is sent, and on a successful sign-in. */
export async function clearOtpAttempts(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(keyFor(email));
  } catch (e) {
    console.error("[otp-attempts] clear failed:", e);
  }
}
