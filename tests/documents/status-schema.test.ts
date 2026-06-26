import { describe, test, expect } from "vitest";

import { DocumentStatusSchema } from "@/lib/validation/documents";
import { DOCUMENT_KINDS } from "@/lib/documents/types";

describe("DocumentStatusSchema", () => {
  test("accepts every real document kind with a boolean obtained", () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(DocumentStatusSchema.safeParse({ kind, obtained: true }).success).toBe(true);
      expect(DocumentStatusSchema.safeParse({ kind, obtained: false }).success).toBe(true);
    }
  });

  test("rejects an unknown kind", () => {
    expect(DocumentStatusSchema.safeParse({ kind: "not-a-real-kind", obtained: true }).success).toBe(false);
  });

  test("rejects a missing or non-boolean obtained", () => {
    expect(DocumentStatusSchema.safeParse({ kind: "passport" }).success).toBe(false);
    expect(DocumentStatusSchema.safeParse({ kind: "passport", obtained: "yes" }).success).toBe(false);
  });
});
