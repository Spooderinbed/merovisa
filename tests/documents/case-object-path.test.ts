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
