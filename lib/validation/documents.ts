// MV-53 — Zod schema for the global document checklist toggle API.
// The kind enum is derived from DOCUMENT_KINDS (the single source of truth shared
// with the SQL check constraint) so a valid toggle is never rejected. owner is
// always read from the session, never the body.

import { z } from "zod";
import { DOCUMENT_KINDS } from "@/lib/documents/types";

/** POST /api/documents/status — mark one document kind obtained / not obtained. */
export const DocumentStatusSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  obtained: z.boolean(),
});
export type DocumentStatusInput = z.infer<typeof DocumentStatusSchema>;
