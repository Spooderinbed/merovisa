import { z } from "zod";

/**
 * One normalization for both steps. "Aarav@Example.COM " and "aarav@example.com"
 * must reach Supabase as the same address, or the code is sent to one identity
 * and verified against another.
 */
const NormalizedEmail = z.string().trim().toLowerCase().pipe(z.email());

/** Matches `otp_length = 6` in supabase/config.toml. */
const OtpCode = z.string().trim().regex(/^\d{6}$/);

const SignInContext = {
  /** Signed claim token for an anonymous assessment (see lib/auth/hmac-claim). */
  claim: z.string().max(400).optional(),
  /** Relative post-sign-in path; still passed through safeNext before use. */
  next: z.string().max(200).optional(),
};

export const EmailStartSchema = z.object({ email: NormalizedEmail, ...SignInContext });
export const EmailVerifySchema = z.object({ email: NormalizedEmail, code: OtpCode, ...SignInContext });

export type EmailStartInput = z.infer<typeof EmailStartSchema>;
export type EmailVerifyInput = z.infer<typeof EmailVerifySchema>;
