import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-refusal-recovery.ts. Guards a free-slug id,
 * the kind enum, optional sector enum, non-empty label/summary, optional structured
 * value/unit/period (present on the 3 figure-bearing records), the http(s) source,
 * ISO lastVerified, unique ids, and provenance (>=1 findingRef).
 */
const NepalRefusalRecoveryRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["refusal-ground", "grant-rate", "recovery-path", "scam-warning"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  sector: z.enum(["higher-education", "vet"]).optional(),
  value: z.number().optional(),
  unit: z.string().min(1).optional(),
  period: z.string().min(1).optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalRefusalRecoverySchema = z
  .array(NepalRefusalRecoveryRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal refusal-recovery ids must be unique",
  });
