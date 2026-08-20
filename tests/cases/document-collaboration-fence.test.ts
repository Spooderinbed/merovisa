import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * MV-185's FENCE, checked in the lane that has no database.
 *
 * `tests/integration/stage4-document-collaboration.itest.ts` proves what the collaboration
 * schema DOES, and only runs when `SUPABASE_TEST_URL` and its two keys are set. This file
 * proves what the slice must never do, from the source alone, so it runs on every `npm test`.
 *
 * Both assertions below exist because the project has a written record of somebody being told
 * to break them:
 *
 *  1. MV-182's migration header says the vault's uniqueness "has to go once, on purpose, with
 *     the whole model behind it". Spec §2 of `2026-08-20-case-document-collaboration.md`
 *     supersedes that, and this test is the superseding sentence made mechanical — because the
 *     next agent to build on this model will read the header, not the spec.
 *  2. The same spec, and MV-182 before it, records `.upsert()` failing at PLAN time against a
 *     column-scoped INSERT grant. It was measured three times (MV-155, MV-168) and each time
 *     the code looked correct.
 *
 * CRLF: the working tree has `autocrlf=true` and no `.gitattributes`, so a `split("\n")` matches
 * zero lines and every assertion below would go VACUOUSLY green — red on Windows only, and this
 * is a Windows machine. Split on `/\r?\n/`, the repo convention.
 */

const MIGRATIONS = path.resolve(__dirname, "..", "..", "supabase", "migrations");
const COLLABORATION_MIGRATION = "20260821120000_stage4_case_document_collaboration.sql";

/** Every migration's text, keyed by filename, newline-normalised. */
function migrations(): Array<{ name: string; lines: string[] }> {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({
      name,
      lines: readFileSync(path.join(MIGRATIONS, name), "utf8").split(/\r?\n/),
    }));
}

/** Lines with `--` comments stripped, so prose ABOUT a statement is never mistaken for one. */
function statements(lines: string[]): string[] {
  return lines
    .map((line) => line.replace(/--.*$/, ""))
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== "");
}

describe("the MV-185 fence", () => {
  test("no migration drops documents_case_kind_idx, or the uniqueness behind it", () => {
    const files = migrations();
    // Non-vacuity: an empty directory read would make every assertion below trivially true.
    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const { name, lines } of files) {
      for (const [index, line] of statements(lines).entries()) {
        const drops =
          (line.includes("drop index") && line.includes("documents_case_kind_idx")) ||
          (line.includes("drop constraint") && line.includes("documents_case_kind")) ||
          (line.includes("alter index") && line.includes("documents_case_kind_idx"));
        if (drops) offenders.push(`${name}:${index + 1} ${line}`);
      }
    }

    // supabase-js compiles `.upsert()` to `INSERT … ON CONFLICT DO UPDATE`, and the arbiter index
    // must EXIST and be FULL. Removing it breaks `upsertDocument` and `app/api/documents/upload`'s
    // atomic replace at PLAN time — a 42501/42P10 on the first call, not a review comment. If a
    // future slice genuinely needs the vault's one-file-per-kind rule gone, it changes this test
    // deliberately and moves every reader of "the current file for this kind" with it.
    expect(offenders).toEqual([]);
  });

  test("the collaboration migration alters nothing in documents or document_status", () => {
    const file = migrations().find((m) => m.name === COLLABORATION_MIGRATION);
    expect(file, `${COLLABORATION_MIGRATION} is missing`).toBeDefined();

    const body = statements(file!.lines);
    // Non-vacuity: a comment-only file would pass the loop below without ever testing anything.
    expect(body.length).toBeGreaterThan(50);

    const offenders = body.filter((line) => {
      const target = /\b(documents|document_status)\b/.test(line);
      if (!target) return false;
      // A `references public.documents(id)` FK is a pointer, not a change: spec §2 permits it and
      // the versions table needs it. Everything else that names the vault is the fence being
      // crossed.
      if (line.includes("references public.documents")) return false;
      return (
        line.startsWith("alter table") ||
        line.startsWith("create policy") ||
        line.startsWith("drop policy") ||
        line.startsWith("create index") ||
        line.startsWith("create unique index") ||
        line.startsWith("drop index") ||
        line.startsWith("grant ") ||
        line.startsWith("revoke ")
      );
    });

    expect(offenders).toEqual([]);
  });

  test("nothing upserts against the two collaboration tables", () => {
    const roots = [path.resolve(__dirname, "..", "..", "lib"), path.resolve(__dirname, "..", "..", "app")];
    const sources: Array<{ file: string; text: string }> = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          sources.push({ file: full, text: readFileSync(full, "utf8").split(/\r?\n/).join("\n") });
        }
      }
    };
    for (const root of roots) walk(root);

    // Non-vacuity, and the reason this test is not merely aspirational: it walks a real tree.
    expect(sources.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const { file, text } of sources) {
      for (const table of ["case_document_versions", "case_document_reviews", "case_document_requests"]) {
        // `.from("<table>")` followed by `.upsert(` before the statement ends. The window is the
        // rest of the chained call, which is what a formatter may have wrapped across lines.
        const pattern = new RegExp(`from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,400}?\\.upsert\\(`);
        if (pattern.test(text)) offenders.push(`${path.relative(process.cwd(), file)} -> ${table}`);
      }
    }

    // Both new tables carry a COLUMN-SCOPED insert grant and no update grant at all, so an
    // `.upsert()` raises 42501 at plan time even on the insert branch — the `DO UPDATE SET`
    // names every payload column whether or not the row exists. MV-190's routes are the first
    // callers these tables will have; this is the guard that meets them.
    expect(offenders).toEqual([]);
  });
});
