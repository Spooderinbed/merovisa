import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-health-biometric-facts.ts. Each record is
 * one labeled value: a number (with a unit) for most facts, or a boolean for the
 * biometrics program-inclusion flag. A refine requires numeric facts to carry a
 * unit (booleans may omit it). Guards the topic/kind enums, the http(s) source,
 * ISO dates, unique ids, and provenance (>=1 findingRef).
 */
const AuHealthBiometricFactSchema = z
  .object({
    id: z.string().min(1),
    topic: z.enum(["health", "biometrics"]),
    kind: z.enum(["validity", "cost-threshold", "agreement-count", "program-inclusion", "service-fee"]),
    label: z.string().min(1),
    value: z.union([z.number(), z.boolean()]),
    unit: z.string().min(1).optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine((r) => typeof r.value === "boolean" || r.unit !== undefined, {
    message: "numeric facts must carry a unit",
  });

export const AuHealthBiometricFactsSchema = z
  .array(AuHealthBiometricFactSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU health/biometric fact ids must be unique",
  });
