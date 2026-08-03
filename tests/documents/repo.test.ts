import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  listDocumentsForCase,
  getDocumentByKindForCase,
  listDocumentsByKindsForCase,
  insertDocument,
  upsertDocument,
  deleteDocument,
} from "@/lib/documents/repo";
import { fakeSupabase } from "@/tests/helpers/fake-supabase";

const CASE = "case-1";
const STUDENT = "u1";
/** What the dual-write helper's `cases` lookup answers with. */
const CASE_ROW = { data: { id: CASE, student_user_id: STUDENT }, error: null };

describe("documents repo", () => {
  test("listDocumentsForCase returns docs, keyed on case_id", async () => {
    const row = {
      id: "d1",
      kind: "ielts",
      owner: STUDENT,
      case_id: CASE,
      file_path: "u1/ielts/f.png",
      file_size: 1000,
      original_name: "f.png",
      created_at: "2026-01-01",
    };
    const { client, calls } = fakeSupabase({ data: [row], error: null });

    const docs = await listDocumentsForCase(client, CASE);

    expect(docs).toHaveLength(1);
    expect(docs[0]?.kind).toBe("ielts");
    expect(calls.some((c) => c.method === "from" && c.args[0] === "documents")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  test("listDocumentsForCase returns empty array when no docs", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await listDocumentsForCase(client, CASE)).toEqual([]);
  });

  test("getDocumentByKindForCase returns matching doc", async () => {
    const { client, calls } = fakeSupabase({ data: { id: "d1", kind: "ielts" }, error: null });

    const doc = await getDocumentByKindForCase(client, CASE, "ielts");

    expect(doc?.kind).toBe("ielts");
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "kind" && c.args[1] === "ielts")).toBe(true);
  });

  test("getDocumentByKindForCase returns null when not found", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getDocumentByKindForCase(client, CASE, "passport")).toBeNull();
  });

  test("listDocumentsByKindsForCase filters by case_id and the kind set", async () => {
    const { client, calls } = fakeSupabase({ data: [], error: null });

    await listDocumentsByKindsForCase(client, CASE, ["ielts", "passport"]);

    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "in" && c.args[0] === "kind")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  test("insertDocument dual-writes case_id and the derived owner", async () => {
    const { client, calls } = fakeSupabase([CASE_ROW, { data: { id: "d2" }, error: null }]);

    const id = await insertDocument(client, {
      caseId: CASE,
      kind: "ielts",
      filePath: "u1/ielts/score.pdf",
      fileSize: 2048,
      originalName: "score.pdf",
    });

    expect(id).toBe("d2");
    const payload = calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ case_id: CASE, owner: STUDENT });
  });

  test("insertDocument returns null when insert errors", async () => {
    const { client } = fakeSupabase([CASE_ROW, { data: null, error: { message: "insert failed" } }]);
    expect(
      await insertDocument(client, {
        caseId: CASE,
        kind: "passport",
        filePath: "u1/passport/p.jpg",
        fileSize: 512,
        originalName: "p.jpg",
      }),
    ).toBeNull();
  });

  test("insertDocument refuses when the case cannot be resolved", async () => {
    const { client, calls } = fakeSupabase([{ data: null, error: null }]);

    expect(
      await insertDocument(client, {
        caseId: CASE,
        kind: "passport",
        filePath: "u1/passport/p.jpg",
        fileSize: 512,
        originalName: "p.jpg",
      }),
    ).toBeNull();
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  test("deleteDocument calls delete chain with id and case_id", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });

    await deleteDocument(client, "d1", CASE);

    expect(calls.some((c) => c.method === "delete")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "d1")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "case_id" && c.args[1] === CASE)).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner")).toBe(false);
  });

  test("upsertDocument replaces on the (case_id,kind) index and returns id", async () => {
    const { client, calls } = fakeSupabase([CASE_ROW, { data: { id: "d3" }, error: null }]);

    const id = await upsertDocument(client, {
      caseId: CASE,
      kind: "passport",
      filePath: "u1/passport/new.png",
      fileSize: 4096,
      originalName: "new.png",
    });

    expect(id).toBe("d3");
    // The crux of the C-8 fix, now case-keyed: an atomic replace on the unique
    // (case_id,kind) index — never a delete-then-insert window that can leave the
    // case with no document row at all. MV-155 shipped that index FULL so
    // PostgREST's bare `on_conflict=` can infer it.
    expect(calls.find((c) => c.method === "upsert")?.args[1]).toEqual({ onConflict: "case_id,kind" });
  });

  test("upsertDocument returns null when the write errors", async () => {
    const { client } = fakeSupabase([CASE_ROW, { data: null, error: { message: "upsert failed" } }]);
    expect(
      await upsertDocument(client, {
        caseId: CASE,
        kind: "passport",
        filePath: "u1/passport/p.jpg",
        fileSize: 512,
        originalName: "p.jpg",
      }),
    ).toBeNull();
  });
});
