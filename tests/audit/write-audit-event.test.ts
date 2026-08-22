import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  writeAuditEvent,
  AuditWriteError,
  DOCUMENT_AUDIT_ACTIONS,
  AUDIT_METADATA_KEYS,
  type AuditEventRow,
} from "@/lib/audit/write-audit-event";

/**
 * MV-189 — the single audit write choke point (spec §8, D11-D15).
 *
 * The module takes its client as a PARAMETER rather than constructing one. That is not
 * ergonomics: `lib/supabase/admin` is fenced by `merovisa/service-role-exception-list`,
 * so a module that imported it would need its own entry in the exception list — an entry
 * that would then have to justify itself as a service-role *call site*, which it is not.
 * The call sites are the five routes; this is the writer they share.
 *
 * One `it(...)` per sentence, because this file is mutation evidence (MISTAKES.md,
 * Testing): three mutants that all name the same bundled test cannot tell "the conjunct
 * is load-bearing" from "something in that test is".
 */

const ACTOR = "99999999-9999-4999-8999-999999999999";
const CASE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ORG_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const ENTITY_ID = "44444444-4444-4444-8444-444444444444";

type InsertResult = { error: { message: string; code?: string } | null };

const makeDb = (result: InsertResult = { error: null }) => {
  const insert = vi.fn(async (_row: AuditEventRow): Promise<InsertResult> => {
    await Promise.resolve();
    return result;
  });
  const from = vi.fn(() => ({ insert }));
  return { db: { from } as never, from, insert };
};

const validInput = {
  actorUserId: ACTOR,
  organizationId: ORG_ID,
  caseId: CASE_ID,
  action: "document.viewed" as const,
  entityType: "document",
  entityId: ENTITY_ID,
};

/**
 * `noUncheckedIndexedAccess` is on, so `calls[0][0]` is `T | undefined`. These two helpers
 * turn "the mock was never called" into a LOUD failure rather than a silent `undefined`
 * that a `toBeUndefined()` assertion would happily accept.
 */
const rowFrom = (insert: { mock: { calls: unknown[][] } }): AuditEventRow => {
  const row = insert.mock.calls[0]?.[0];
  if (row === undefined) throw new Error("insert was never called");
  return row as AuditEventRow;
};

const rejection = async (promise: Promise<void>): Promise<Error> => {
  try {
    await promise;
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a rejection, got a resolution");
};

beforeEach(() => vi.clearAllMocks());

describe("writeAuditEvent — the row it writes", () => {
  it("writes to public.audit_events and nowhere else", async () => {
    const { db, from } = makeDb();
    await writeAuditEvent(db, validInput);
    expect(from).toHaveBeenCalledWith("audit_events");
  });

  it("maps every field onto its snake_case column", async () => {
    const { db, insert } = makeDb();
    await writeAuditEvent(db, { ...validInput, metadata: { kind: "passport" } });
    expect(insert).toHaveBeenCalledWith({
      organization_id: ORG_ID,
      case_id: CASE_ID,
      actor_user_id: ACTOR,
      action: "document.viewed",
      entity_type: "document",
      entity_id: ENTITY_ID,
      metadata: { kind: "passport" },
    });
  });

  it("defaults metadata to an empty object rather than omitting the column", async () => {
    const { db, insert } = makeDb();
    await writeAuditEvent(db, validInput);
    expect(rowFrom(insert).metadata).toEqual({});
  });

  it("never writes an id or a created_at — both are database defaults on an append-only table", async () => {
    const { db, insert } = makeDb();
    await writeAuditEvent(db, validInput);
    const row = rowFrom(insert) as unknown as Record<string, unknown>;
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
  });
});

describe("D14 — actor_user_id is the authenticated human", () => {
  it("writes the actor id it was given", async () => {
    const { db, insert } = makeDb();
    await writeAuditEvent(db, validInput);
    expect(rowFrom(insert).actor_user_id).toBe(ACTOR);
  });

  it("refuses to write a row with no actor — an unattributed access event is not evidence", async () => {
    const { db, insert } = makeDb();
    await expect(writeAuditEvent(db, { ...validInput, actorUserId: "" })).rejects.toThrow(
      AuditWriteError,
    );
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("D15 — organization_id is the case's own, and null is a legitimate value", () => {
  it("writes the organization id when the case has one", async () => {
    const { db, insert } = makeDb();
    await writeAuditEvent(db, validInput);
    expect(rowFrom(insert).organization_id).toBe(ORG_ID);
  });

  it("writes null for a personal case rather than refusing or inventing an org", async () => {
    const { db, insert } = makeDb();
    await writeAuditEvent(db, { ...validInput, organizationId: null });
    expect(rowFrom(insert).organization_id).toBeNull();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("D12 — the write is fail-closed", () => {
  it("throws when the insert returns an error, because PostgREST RESOLVES a 42501 rather than rejecting", async () => {
    const { db } = makeDb({ error: { message: "permission denied", code: "42501" } });
    await expect(writeAuditEvent(db, validInput)).rejects.toThrow(AuditWriteError);
  });

  it("throws when the client itself rejects", async () => {
    const from = vi.fn(() => ({
      insert: vi.fn(async () => {
        throw new Error("network down");
      }),
    }));
    await expect(writeAuditEvent({ from } as never, validInput)).rejects.toThrow(AuditWriteError);
  });

  it("resolves silently on success — the caller's happy path is not asked to check a boolean", async () => {
    const { db } = makeDb();
    await expect(writeAuditEvent(db, validInput)).resolves.toBeUndefined();
  });

  it("carries no actor, case or org identifier in the thrown message", async () => {
    const { db } = makeDb({ error: { message: "permission denied", code: "42501" } });
    const err = await rejection(writeAuditEvent(db, validInput));
    expect(err.message).not.toContain(ACTOR);
    expect(err.message).not.toContain(CASE_ID);
    expect(err.message).not.toContain(ORG_ID);
  });
});

describe("D13 — metadata and entity_id carry no free text", () => {
  it("accepts every key on the allow-list", async () => {
    const { db } = makeDb();
    const metadata = Object.fromEntries(AUDIT_METADATA_KEYS.map((k) => [k, "x"]));
    await expect(writeAuditEvent(db, { ...validInput, metadata })).resolves.toBeUndefined();
  });

  it("throws on a metadata key outside the allow-list, at runtime and not only in the type", async () => {
    const { db, insert } = makeDb();
    await expect(
      writeAuditEvent(db, {
        ...validInput,
        metadata: { original_name: "Ram_Bahadur_passport_2026.pdf" } as never,
      }),
    ).rejects.toThrow(AuditWriteError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("names the offending key so the failure is actionable", async () => {
    const { db } = makeDb();
    const err = await rejection(
      writeAuditEvent(db, { ...validInput, metadata: { note: "looks fake to me" } as never }),
    );
    expect(err.message).toContain("note");
  });

  it("does NOT leak the offending VALUE into the error message — that is the PII it just refused", async () => {
    const { db } = makeDb();
    const err = await rejection(
      writeAuditEvent(db, {
        ...validInput,
        metadata: { original_name: "Ram_Bahadur_passport_2026.pdf" } as never,
      }),
    );
    expect(err.message).not.toContain("Ram_Bahadur");
  });

  it("throws when entity_id is not a uuid — a filename must never ride in as an id", async () => {
    const { db, insert } = makeDb();
    await expect(
      writeAuditEvent(db, { ...validInput, entityId: "Ram_Bahadur_passport_2026.pdf" }),
    ).rejects.toThrow(AuditWriteError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts a well-formed uuid entity_id", async () => {
    const { db } = makeDb();
    await expect(writeAuditEvent(db, validInput)).resolves.toBeUndefined();
  });
});

describe("the action vocabulary", () => {
  it("is dotted, past-tense and noun-first, matching SANCTIONED_SERVICE_ROLE_CATEGORIES", () => {
    for (const action of DOCUMENT_AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(action.startsWith("document.")).toBe(true);
    }
  });

  it("reuses `document.viewed` verbatim from the category list rather than coining a synonym", () => {
    expect(DOCUMENT_AUDIT_ACTIONS).toContain("document.viewed");
  });

  it("covers all five document-access paths", () => {
    expect([...DOCUMENT_AUDIT_ACTIONS].sort()).toEqual([
      "document.deleted",
      "document.downloaded",
      "document.uploaded",
      "document.version_uploaded",
      "document.viewed",
    ]);
  });

  it("throws on an action outside the union", async () => {
    const { db, insert } = makeDb();
    await expect(
      writeAuditEvent(db, { ...validInput, action: "document.exfiltrated" as never }),
    ).rejects.toThrow(AuditWriteError);
    expect(insert).not.toHaveBeenCalled();
  });
});
