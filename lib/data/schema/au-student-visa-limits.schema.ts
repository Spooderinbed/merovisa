import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/policy/au-student-visa-limits.ts. Guards http(s)
 * source URLs, ISO dates, a positive numeric limit with a known unit, the
 * Subclass 500/590 set, the kind/appliesTo enums, unique ids, and provenance
 * (>=1 findingRef) on every record — so no limit can ship without tracing to a
 * `used` finding.
 */
const AuStudentVisaLimitSchema = z.object({
  id: z.string().min(1),
  subclass: z.union([z.literal(500), z.literal(590)]),
  kind: z.enum(["stay-period", "work-limit", "processing-time", "application-limit"]),
  appliesTo: z.enum(["student", "family-member", "guardian"]),
  label: z.string().min(1),
  value: z.number().positive(),
  unit: z.enum(["years", "hours-per-fortnight", "days", "words"]),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuStudentVisaLimitsSchema = z
  .array(AuStudentVisaLimitSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU student-visa-limit ids must be unique",
  });
