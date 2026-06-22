import { z } from "zod";

/**
 * Runtime schema for lib/data/source/au-cricos-directory.ts — the complete CRICOS
 * provider directory harvested from DHA's Document Checklist Tool. Guards the
 * record shape (a non-empty provider name + a well-formed CRICOS code: five digits
 * + an uppercase letter) and a sanity floor on directory size, so a broken or
 * truncated harvest can never ship. cricosCode is intentionally NOT unique — a
 * provider can trade under several names on one code.
 */
const AuCricosDirectoryEntrySchema = z.object({
  provider: z.string().min(1),
  cricosCode: z.string().regex(/^\d{5}[A-Z]$/, "expected a CRICOS code like 00026A"),
});

export const AuCricosDirectorySchema = z.array(AuCricosDirectoryEntrySchema).min(1000);
