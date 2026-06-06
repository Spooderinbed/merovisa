import { describe, it, expect } from "vitest";
import { DATA_MODULES } from "@/lib/data/schema/registry";

// Generic, registry-driven: every registered data module must satisfy its Zod
// schema. Adding a category to the registry automatically extends this guard.
describe("registered data modules validate against their schema", () => {
  for (const entry of DATA_MODULES) {
    it(`${entry.category}: ${entry.exportName} parses under its schema`, () => {
      const result = entry.schema.safeParse(entry.data);
      if (!result.success) {
        throw new Error(`${entry.exportName} failed schema:\n${JSON.stringify(result.error.issues, null, 2)}`);
      }
      expect(result.success).toBe(true);
    });
  }
});
