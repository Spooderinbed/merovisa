import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-student-worker-wages.ts. Guards http(s)
 * source URLs, ISO dates, the wage-type/penalty-day/status enums, and unique ids,
 * and enforces the discriminator invariant: a super-guarantee row sets `ratePct`
 * (only), every wage row sets `hourlyRateAud` (only), and `award`/`penaltyDay`
 * appear exactly on the award-penalty rows — so a rate can't ship in the wrong
 * column or without tracing to a `used` finding.
 */
const AuWorkerWageSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    wageType: z.enum(["super-guarantee", "national-minimum-wage", "award-penalty"]),
    ratePct: z.number().positive().optional(),
    hourlyRateAud: z.number().positive().optional(),
    award: z.string().min(1).optional(),
    penaltyDay: z.enum(["ordinary", "saturday", "sunday", "public-holiday"]).optional(),
    status: z.enum(["current", "announced"]).optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine(
    (r) =>
      r.wageType === "super-guarantee"
        ? r.ratePct !== undefined && r.hourlyRateAud === undefined
        : r.hourlyRateAud !== undefined && r.ratePct === undefined,
    { message: "super-guarantee rows set ratePct only; wage rows set hourlyRateAud only" },
  )
  .refine(
    (r) =>
      r.wageType === "award-penalty"
        ? r.award !== undefined && r.penaltyDay !== undefined
        : r.award === undefined && r.penaltyDay === undefined,
    { message: "award-penalty rows set award + penaltyDay; other rows set neither" },
  );

export const AuStudentWorkerWagesSchema = z
  .array(AuWorkerWageSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU worker-wage ids must be unique",
  });
