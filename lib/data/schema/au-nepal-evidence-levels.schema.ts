import { z } from "zod";

/**
 * Runtime schema for lib/data/source/au-nepal-evidence-levels.ts — the per-provider
 * Nepal evidence-level map. Every value must be one of the DHA framework's three
 * levels, and every key must be a well-formed CRICOS code, so a malformed key or an
 * out-of-vocabulary level (e.g. a leaked error sentinel from a failed harvest call)
 * can never ship.
 */
export const NepalEvidenceLevelSchema = z.enum(["Regular", "Streamlined", "Undetermined"]);

export const AuNepalEvidenceLevelsSchema = z
  .record(z.string(), NepalEvidenceLevelSchema)
  .refine((map) => Object.keys(map).every((k) => /^\d{5}[A-Z]$/.test(k)), {
    message: "every key must be a CRICOS code like 00026A",
  });
