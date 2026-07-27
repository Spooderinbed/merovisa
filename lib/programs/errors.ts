/**
 * A catalogue read (programs / universities) failed — the query never answered.
 *
 * Distinct from an empty answer on purpose (MV-133). The repos used to collapse both
 * into `[]`, so a transient Supabase outage rendered as "no programs found": a
 * confident false negative telling the student the product has nothing for them. Callers
 * catch this to show an honest outage/retry state, or let it reach the MV-62 error
 * boundary. Lives outside `repo.ts` so surfaces (and tests that mock the repo) can
 * identify it without pulling in the `server-only` read layer.
 */
export class CatalogReadError extends Error {
  readonly table: string;

  constructor(table: string, cause?: unknown) {
    super(`Catalogue read failed: ${table}`, { cause });
    this.name = "CatalogReadError";
    this.table = table;
  }
}

export function isCatalogReadError(err: unknown): err is CatalogReadError {
  return err instanceof CatalogReadError;
}
