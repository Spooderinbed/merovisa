import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  listDocumentsForUser,
  getDocumentByKind,
  insertDocument,
  deleteDocument,
} from "@/lib/documents/repo";
import { fakeSupabase } from "@/tests/helpers/fake-supabase";

describe("documents repo", () => {
  test("listDocumentsForUser returns docs", async () => {
    const row = {
      id: "d1",
      kind: "ielts",
      owner: "u1",
      status: "extracted",
      file_path: "u1/ielts/f.png",
      file_size: 1000,
      original_name: "f.png",
      extracted_data: null,
      profile_section: "english",
      created_at: "2026-01-01",
    };
    const { client, calls } = fakeSupabase({ data: [row], error: null });
    const docs = await listDocumentsForUser(client, "u1");
    expect(docs).toHaveLength(1);
    expect(docs[0]?.kind).toBe("ielts");
    expect(calls.some((c) => c.method === "from" && c.args[0] === "documents")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
  });

  test("listDocumentsForUser returns empty array when no docs", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    const docs = await listDocumentsForUser(client, "u1");
    expect(docs).toEqual([]);
  });

  test("getDocumentByKind returns matching doc", async () => {
    const row = { id: "d1", kind: "ielts", owner: "u1" };
    const { client, calls } = fakeSupabase({ data: row, error: null });
    const doc = await getDocumentByKind(client, "u1", "ielts");
    expect(doc).not.toBeNull();
    expect(doc?.kind).toBe("ielts");
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "kind" && c.args[1] === "ielts")).toBe(true);
  });

  test("getDocumentByKind returns null when not found", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    const doc = await getDocumentByKind(client, "u1", "passport");
    expect(doc).toBeNull();
  });

  test("insertDocument inserts and returns id", async () => {
    const { client, calls } = fakeSupabase({ data: { id: "d2" }, error: null });
    const id = await insertDocument(client, {
      owner: "u1",
      kind: "ielts",
      filePath: "u1/ielts/score.pdf",
      fileSize: 2048,
      originalName: "score.pdf",
      extractedData: { overall: 7.5 },
      profileSection: "english",
      status: "extracted",
    });
    expect(id).toBe("d2");
    expect(calls.some((c) => c.method === "insert")).toBe(true);
    expect(calls.some((c) => c.method === "single")).toBe(true);
  });

  test("insertDocument returns null when insert errors", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "insert failed" } });
    const id = await insertDocument(client, {
      owner: "u1",
      kind: "passport",
      filePath: "u1/passport/p.jpg",
      fileSize: 512,
      originalName: "p.jpg",
      extractedData: null,
      profileSection: "personal",
      status: "stored",
    });
    expect(id).toBeNull();
  });

  test("deleteDocument calls delete chain with id and owner", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await deleteDocument(client, "d1", "u1");
    expect(calls.some((c) => c.method === "delete")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "d1")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
  });
});
