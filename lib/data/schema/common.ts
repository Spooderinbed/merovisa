import { z } from "zod";

/**
 * Shared Zod building blocks for validating sourced data modules.
 * Mirrors the validation idiom in lib/validation/profile-section.ts.
 */

/** ISO calendar date, YYYY-MM-DD. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected ISO date YYYY-MM-DD");

/** An http(s) source URL. */
export const HttpUrl = z.string().regex(/^https?:\/\//, "expected an http(s) URL");

/** A research finding id, e.g. "B.045". */
// Topic prefix is a category letter plus an optional sub-topic digit (e.g. J1, J2),
// then a zero-padded number: A.001, B.045, J1.001, J2.010.
export const FindingId = z.string().regex(/^[A-J]\d*\.\d{3,}$/, "expected a finding id like B.045 or J1.001");

/** Machine-checkable provenance attached to a sourced data record. */
export const ProvenanceSchema = z.object({
  findingRefs: z.array(FindingId).min(1, "at least one findingRef is required"),
  source: HttpUrl.optional(),
  lastVerified: IsoDate.optional(),
  effectiveDate: IsoDate.optional(),
  note: z.string().optional(),
});

const MS_PER_DAY = 86_400_000;

/**
 * An ISO date that must also be no older than `maxAgeDays`. Used for staleness
 * checks on volatile values (FX, tuition). Format is enforced first, so a
 * non-ISO string fails before the age check runs.
 */
export function freshIsoDate(maxAgeDays: number) {
  return IsoDate.refine(
    (d) => (Date.now() - Date.parse(d)) / MS_PER_DAY <= maxAgeDays,
    { message: `source older than ${maxAgeDays} days — re-verify` },
  );
}
