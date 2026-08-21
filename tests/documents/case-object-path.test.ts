import { describe, it, expect } from "vitest";

import {
  CASE_OBJECT_PREFIX,
  caseObjectPath,
  caseVersionObjectPath,
  isCaseScopedObjectPath,
  isOwnCaseObjectPath,
} from "@/lib/documents/case-object-path";

/**
 * MV-190 — the case-keyed object path (spec §4 (1), §6.2).
 *
 * The DATABASE bound (`case_document_versions_storage_path_case_prefix`) is asserted in
 * `tests/integration/stage4-case-storage.itest.ts`, because only Postgres can answer it. What is
 * asserted HERE is the exact shape the builder produces and the predicate the signed-download
 * helper uses to refuse a path that has wandered out of its case.
 *
 * The two are deliberately not the same instrument. The constraint is the FLOOR — a prefix bound
 * that binds every role including `service_role`. The builder is the CEILING — one exact path per
 * version, so no caller has to decide the shape for itself.
 */

const CASE_A = "11111111-1111-4111-8111-111111111111";
const CASE_B = "22222222-2222-4222-8222-222222222222";
const VERSION = "33333333-3333-4333-8333-333333333333";

/**
 * Every fixture above is lowercase, which is exactly how this defect survived review: `z.uuid()`
 * accepts `A1B2…` as readily as `a1b2…`, and `resolveTargetCase` hands the caller's string on
 * verbatim. A non-canonical `?caseId=` therefore reached `caseObjectPath` unaltered and got baked
 * into a PERSISTED Storage key, while `documents.case_id` stored the same id lowercase — after
 * which the byte-exact `isOwnCaseObjectPath` could never match it again and the only supported
 * download path answered 500, blaming our own stored row.
 */
describe("a non-canonical case id is canonicalised, because the key is persisted", () => {
  // HEX LETTERS ARE THE POINT. The fixtures above are all digits, so `.toUpperCase()` on them is a
  // no-op and every assertion here would pass against the unfixed code — the first draft of this
  // block did exactly that. A test for casing needs an id that can BE cased.
  const HEX_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const HEX_B = "ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb";

  it("is a fixture that can actually express casing", () => {
    expect(HEX_A.toUpperCase()).not.toBe(HEX_A);
    expect(CASE_A.toUpperCase()).toBe(CASE_A); // why the shared fixtures cannot be used here
  });

  it("builds the same key whether the caller shouts the uuid or not", () => {
    expect(caseObjectPath(HEX_A.toUpperCase(), "f.png")).toBe(caseObjectPath(HEX_A, "f.png"));
    expect(caseObjectPath(HEX_A.toUpperCase(), "f.png")).toBe(
      `${CASE_OBJECT_PREFIX}/${HEX_A}/f.png`,
    );
  });

  it("round-trips: a key written from an UPPERCASE id is still readable via the lowercase one", () => {
    // The write and the read arriving in different casings is the whole failure mode.
    const written = caseObjectPath(HEX_A.toUpperCase(), "f.png");
    expect(isOwnCaseObjectPath(HEX_A, written)).toBe(true);
    expect(isOwnCaseObjectPath(HEX_A.toUpperCase(), written)).toBe(true);
  });

  it("admits a legacy key that was already written uppercase, rather than locking the file away", () => {
    const legacy = `${CASE_OBJECT_PREFIX}/${HEX_A.toUpperCase()}/f.png`;
    expect(isOwnCaseObjectPath(HEX_A, legacy)).toBe(true);
  });

  it("still refuses ANOTHER case in either casing — folding must not widen the bound", () => {
    const foreign = caseObjectPath(HEX_B, "f.png");
    expect(isOwnCaseObjectPath(HEX_A, foreign)).toBe(false);
    expect(isOwnCaseObjectPath(HEX_A.toUpperCase(), foreign)).toBe(false);
    expect(isOwnCaseObjectPath(HEX_A, `${CASE_OBJECT_PREFIX}/${HEX_B.toUpperCase()}/f.png`)).toBe(
      false,
    );
    // And the bare case segment with nothing after it is still not a file.
    expect(isOwnCaseObjectPath(HEX_A, `${CASE_OBJECT_PREFIX}/${HEX_A.toUpperCase()}/`)).toBe(false);
  });

  it("keeps the CHECK constraint satisfiable: the case segment matches case_id::text exactly", () => {
    // Postgres renders `uuid::text` lowercase, so the DB floor
    // (`storage_path like 'case/' || case_id::text || '/%'`) only admits a lowercase segment.
    const key = caseObjectPath(HEX_A.toUpperCase(), "f.png");
    expect(key.split("/")[1]).toBe(HEX_A);
  });
});

describe("caseVersionObjectPath", () => {
  it("builds exactly `case/<case_id>/<version_id>`", () => {
    // The spec documents this string. A test that rebuilt it by template would agree with any
    // change to the builder, so it is written out.
    expect(caseVersionObjectPath(CASE_A, VERSION)).toBe(
      "case/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333",
    );
  });

  it("uses the shared prefix constant, so the constraint and the builder cannot drift apart", () => {
    expect(caseVersionObjectPath(CASE_A, VERSION).startsWith(`${CASE_OBJECT_PREFIX}/`)).toBe(true);
    expect(CASE_OBJECT_PREFIX).toBe("case");
  });

  it("adds no file extension — the content type is a column on the row, not a suffix on the key", () => {
    // `case_document_versions.content_type` exists precisely so the key does not have to carry it.
    // The vault's owner-keyed paths carry an extension only because `documents` has no such column.
    expect(caseVersionObjectPath(CASE_A, VERSION)).not.toContain(".");
  });

  it("REFUSES to build a path from a malformed case id", () => {
    // A silent `case/undefined/…` would satisfy neither the constraint nor any reader, and would
    // surface as a 23514 from deep inside a repository rather than as a bad argument here.
    expect(() => caseVersionObjectPath("not-a-uuid", VERSION)).toThrow(/case id/i);
  });

  it("REFUSES to build a path from a malformed version id", () => {
    expect(() => caseVersionObjectPath(CASE_A, "")).toThrow(/version id/i);
  });
});

describe("caseObjectPath", () => {
  it("keys a vault object by CASE when the upload names one", () => {
    // The upload route uses this for a NAMED case. A counsellor uploading to a student's case must
    // not write into their OWN uid folder: `Users read own document files` would then let them
    // read those bytes directly, forever, with no case check — surviving un-assignment.
    expect(caseObjectPath(CASE_A, "abc.pdf")).toBe(
      "case/11111111-1111-4111-8111-111111111111/abc.pdf",
    );
  });

  it("REFUSES an object name carrying its own separator", () => {
    // A name with a `/` invents a folder the case bound was never written for.
    expect(() => caseObjectPath(CASE_A, "nested/abc.pdf")).toThrow(/object name/i);
  });

  it("REFUSES an empty object name", () => {
    expect(() => caseObjectPath(CASE_A, "")).toThrow(/object name/i);
  });

  it("REFUSES a malformed case id", () => {
    expect(() => caseObjectPath("not-a-uuid", "abc.pdf")).toThrow(/case id/i);
  });
});

describe("isCaseScopedObjectPath", () => {
  it("recognises a case-keyed key", () => {
    expect(isCaseScopedObjectPath(caseVersionObjectPath(CASE_A, VERSION))).toBe(true);
  });

  it("does NOT recognise an owner-keyed vault key", () => {
    // The vault's shape is `<owner_uid>/<kind>/<uuid>.<ext>`. Telling the two apart is what lets
    // the download helper apply the case bound to one and not the other.
    expect(isCaseScopedObjectPath(`${CASE_A}/passport/${VERSION}.pdf`)).toBe(false);
  });

  it("does NOT treat a key that merely begins with the letters `case` as case-keyed", () => {
    // `casefiles/…` is a different folder. Without the separator check the prefix test is a
    // substring test, and every sibling folder inherits the rule meant for one.
    expect(isCaseScopedObjectPath("casefiles/x/y")).toBe(false);
  });
});

describe("isOwnCaseObjectPath", () => {
  it("admits a case-keyed key that belongs to the case being authorized", () => {
    expect(isOwnCaseObjectPath(CASE_A, caseVersionObjectPath(CASE_A, VERSION))).toBe(true);
  });

  it("REFUSES a case-keyed key belonging to ANOTHER case", () => {
    // The whole reason the helper exists: authorizing case A and then signing case B's object is
    // a cross-case disclosure that no permission check would notice, because the permission check
    // was about the case and the signature is about the path.
    expect(isOwnCaseObjectPath(CASE_A, caseVersionObjectPath(CASE_B, VERSION))).toBe(false);
  });

  it("REFUSES a key that escapes its own folder with a traversal segment", () => {
    // Storage keys are literal and not filesystem paths, so `..` resolves to nothing rather than
    // to a parent — but a key that reads as an escape has no legitimate producer, and refusing it
    // costs one comparison.
    expect(isOwnCaseObjectPath(CASE_A, `${CASE_OBJECT_PREFIX}/${CASE_A}/../${CASE_B}/x`)).toBe(false);
  });

  it("REFUSES a key whose case segment merely STARTS WITH this case id", () => {
    // Boundary check: without the trailing separator, `case/<id>` would match `case/<id>extra/…`.
    expect(isOwnCaseObjectPath(CASE_A, `${CASE_OBJECT_PREFIX}/${CASE_A}extra/${VERSION}`)).toBe(false);
  });

  it("REFUSES a case-keyed key with nothing after the case segment", () => {
    expect(isOwnCaseObjectPath(CASE_A, `${CASE_OBJECT_PREFIX}/${CASE_A}/`)).toBe(false);
  });

  it("admits an owner-keyed vault key, because the case bound does not apply to it", () => {
    // A vault object is owner-keyed and cannot carry a case in its name at all. It is authorized
    // by the case-filtered row read that produced it — `[id]/view` reads `documents` with
    // `.eq("case_id", caseId)` — and this predicate must not pretend to re-check that.
    expect(isOwnCaseObjectPath(CASE_A, `${CASE_B}/passport/${VERSION}.pdf`)).toBe(true);
  });
});
