/**
 * Registry of sourced data modules. One entry per integrated slice.
 *
 * Iterated by:
 *  - tests/data/schema.test.ts   (validates each module against its Zod schema)
 *  - tests/data/reconcile.test.ts (walks provenance, reconciles against findings)
 *
 * Adding a category = append one entry here + its `*.schema.ts`.
 */
export interface DataModuleEntry {
  /** Research category this module integrates (A–J). */
  category: string;
  /** `@/`-aliased module path for dynamic import, e.g. "@/lib/data/source/nepal-banks". */
  importPath: string;
  /** Named export of the data array/object, e.g. "NEPAL_BANKS". */
  exportName: string;
  /** `@/`-aliased schema module path, e.g. "@/lib/data/schema/nepal-banks.schema". */
  schemaImport: string;
  /** Named export of the Zod schema, e.g. "NepalBanksSchema". */
  schemaName: string;
  /** Interface names whose records are exempt from provenance (UI-only data). */
  provenanceExemptInterfaces?: string[];
}

export const DATA_MODULES: DataModuleEntry[] = [
  // Populated per slice, starting with the bank retrofit in Phase 1.
];
