import "server-only";
import { getRedis } from "@/lib/rate-limit/upstash";

/**
 * Guesses a single emailed code survives before it is retired.
 *
 * Both the app's verify limit and GoTrue's own are per-IP, so a rotating IP pool
 * could otherwise spend the code's whole life guessing — against a 1,000,000
 * keyspace, on the only credential an email-auth account has. Counting per address
 * instead caps a code at MAX_OTP_ATTEMPTS guesses, and the send endpoint already
 * caps codes at 5 per address per hour: 25 guesses an hour, which is nowhere near
 * six digits.
 *
 * Deliberately NOT an address lockout. The count is scoped to one code and wiped
 * whenever a new one is sent, so burning a code can never park a student outside
 * their own account — "send a new code" stays open.
 *
 * This only binds guesses that arrive through /api/auth/email/verify. GoTrue's
 * own /auth/v1/verify is reachable directly with the public anon key and is
 * bounded only by its per-IP limit, so this is a meaningful control, not a
 * complete one — see docs/email-auth-setup.md.
 */
export const MAX_OTP_ATTEMPTS = 5;

/** Matches `otp_expiry` in supabase/config.toml — the counter dies with its code. */
const TTL_SECONDS = 600;

const keyFor = (email: string) => `mv:otp-attempts:${email}`;

/**
 * Claims one attempt against the current code and returns its number.
 *
 * Callers must reserve BEFORE verifying, never read-then-write afterwards: INCR
 * is atomic, but a separate read leaves a check-then-act window in which a burst
 * of concurrent guesses all observe the same stale count and all get through —
 * exactly what the rotating-IP attacker this guards against is doing.
 *
 * Fails OPEN (returns 0). Email OTP is the sole credential for these accounts, so
 * refusing every sign-in while Redis is unreachable would be a worse outage than
 * the exposure it guards. Same posture as checkRateLimit.
 */
export async function recordOtpAttempt(email: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const count = await redis.incr(keyFor(email));
    // Only the first attempt needs the TTL; re-setting it on every guess would let
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
