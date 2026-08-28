import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import { AUDIT_ACTIONS, AUDIT_METADATA_KEYS } from "@/lib/audit/write-audit-event";
import { SERVICE_ROLE_EXCEPTIONS } from "@/lib/supabase/service-role-exceptions";

/**
 * MV-189 — the D13 source sweep (spec §8.3).
 *
 * The runtime allow-list in `write-audit-event.ts` fences the metadata KEY. This file is
 * the second, independent layer: it fences a free-text VALUE smuggled in under a
 * permitted key — `metadata: { kind: safeOriginalName }` typechecks, passes the runtime
 * key check, and puts `Ram_Bahadur_passport_2026.pdf` into the evidence log.
 *
 * The plan's constraint is not a preference: "Sensitive document content, passport
 * numbers, and raw student details must not be copied into audit metadata" (line 275).
 *
 * ## Two things this file is careful about
 *
 * 1. **It splits on `/\r?\n/`.** This is a CRLF working tree (`autocrlf=true`, no
 *    `.gitattributes`). `split("\n")` matches ZERO lines here and every assertion below
 *    would go VACUOUSLY GREEN — red only on Windows, green on Linux CI, which is the
 *    worst possible direction for a guard to fail in. MISTAKES.md records this costing
 *    real time already.
 * 2. **It proves it can SEE the call sites before asserting anything about them.** A
 *    sweep that silently matched no files would pass identically against a route that
 *    leaks every filename it touches. The first test in each block is the control.
 */

const REPO_ROOT = join(__dirname, "..", "..");

/**
 * Every audited route, taken from the exception list rather than retyped — five
 * document-access paths from MV-189 plus MV-193's two invitation paths.
 *
 * The sweep below is deliberately NOT narrowed to document routes now that a second
 * concern is audited. `metadata: { reason: email }` on an invitation route would put a
 * student's address in the evidence log exactly as `{ kind: safeOriginalName }` would
 * put their filename there, and a guard that only looked at document routes would have
 * nothing to say about it.
 */
const AUDITED_PATHS = SERVICE_ROLE_EXCEPTIONS.filter((e) => e.auditEvent !== null).map(
  (e) => e.path,
);

// Splits on /\r?\n/ — see the header. `split("\n")` returns ONE element on this tree and
// every assertion downstream goes vacuously green.
const readSource = (relPath: string): string[] =>
  readFileSync(join(REPO_ROOT, relPath), "utf8").split(/\r?\n/);

/**
 * Identifiers that carry user-supplied free text, or a path that invites a derived one.
 * `note` and `title` are the request/review free-text columns; the rest are filenames and
 * storage keys.
 */
const BANNED_IN_METADATA = [
  "original_name",
  "originalName",
  "safeOriginalName",
  "file.name",
  "note",
  "title",
  "file_path",
  "filePath",
  "storage_path",
  "storagePath",
];

/**
 * Extract each `writeAuditEvent(...)` call's source text, brace-balanced from the call
 * opener. Deliberately textual: the point is to read what an AUTHOR WROTE, which a
 * runtime assertion cannot see.
 */
function auditCallBlocks(lines: string[]): string[] {
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!(lines[i] ?? "").includes("writeAuditEvent(")) continue;
    let depth = 0;
    let started = false;
    const collected: string[] = [];
    for (let j = i; j < lines.length; j += 1) {
      const line = lines[j] ?? "";
      collected.push(line);
      for (const ch of line) {
        if (ch === "(") {
          depth += 1;
          started = true;
        } else if (ch === ")") depth -= 1;
      }
      if (started && depth <= 0) break;
    }
    blocks.push(collected.join("\n"));
  }
  return blocks;
}

describe("D13 — the sweep can see what it is sweeping (controls)", () => {
  it("finds exactly eight audited paths in the exception list", () => {
    // Five document-access routes (MV-189) + two invitation routes (MV-193) + the
    // acceptance route (MV-194).
    expect(AUDITED_PATHS).toHaveLength(8);
  });

  it("splits a CRLF source file into more than one line — the vacuous-green guard", () => {
    const first = AUDITED_PATHS[0];
    if (first === undefined) throw new Error("no audited paths to check");
    expect(readSource(first).length).toBeGreaterThan(20);
  });

  it("locates at least one writeAuditEvent call in every audited route", () => {
    for (const path of AUDITED_PATHS) {
      expect(auditCallBlocks(readSource(path)), `no audit call found in ${path}`).not.toHaveLength(
        0,
      );
    }
  });

  it("would catch a banned identifier if one were present — the sweep itself bites", () => {
    const planted = [
      "  await writeAuditEvent(admin, {",
      "    metadata: { kind: safeOriginalName },",
      "  });",
    ];
    const [block] = auditCallBlocks(planted);
    if (block === undefined) throw new Error("the sweep failed to find a planted call");
    expect(BANNED_IN_METADATA.some((banned) => block.includes(banned))).toBe(true);
  });
});

describe("D13 — no free text reaches an audit call site", () => {
  it.each(AUDITED_PATHS)("%s passes no banned identifier to writeAuditEvent", (path) => {
    const blocks = auditCallBlocks(readSource(path));
    for (const block of blocks) {
      // Strip comments: the routes DISCUSS `original_name` at length to explain why it is
      // withheld, and a sweep that failed on the explanation would push authors to delete
      // the reasoning rather than keep the guarantee.
      const code = block
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith("//"))
        .join("\n");
      for (const banned of BANNED_IN_METADATA) {
        expect(code, `${path} passes \`${banned}\` into an audit call`).not.toContain(banned);
      }
    }
  });
});

describe("D13 — the allow-list itself carries no free-text key", () => {
  it("contains no key whose name suggests user-supplied text", () => {
    for (const key of AUDIT_METADATA_KEYS) {
      expect(BANNED_IN_METADATA).not.toContain(key);
    }
  });

  it("is a closed list, so a new table's free-text column cannot arrive by default", () => {
    expect([...AUDIT_METADATA_KEYS].sort()).toEqual([
      "byte_size",
      "case_keyed",
      "document_id",
      "kind",
      "mime_type",
      "reason",
      "request_id",
      "version_id",
    ]);
  });
});

describe("the exception list agrees with the writer's vocabulary", () => {
  it("every wired auditEvent is an action the writer will accept", () => {
    for (const entry of SERVICE_ROLE_EXCEPTIONS) {
      if (entry.auditEvent === null) continue;
      expect(AUDIT_ACTIONS, `${entry.path} names an unknown action`).toContain(entry.auditEvent);
    }
  });

  it("every action the writer knows is claimed by exactly one exception entry", () => {
    const claimed = SERVICE_ROLE_EXCEPTIONS.map((e) => e.auditEvent).filter(Boolean);
    // Both directions, and the second is the one that bites: an action added to the
    // writer's vocabulary with no route emitting it is a name nobody uses, and an
    // `invitation.accepted` added here before slice 2 ships would be exactly that.
    expect([...claimed].sort()).toEqual([...AUDIT_ACTIONS].sort());
  });

  it("leaves the other thirteen entries null — Stage 6's scope, not this slice's", () => {
    const nulls = SERVICE_ROLE_EXCEPTIONS.filter((e) => e.auditEvent === null);
    expect(nulls).toHaveLength(13);
  });

  it("wires the audited routes and no others", () => {
    expect([...AUDITED_PATHS].sort()).toEqual(
      [
        "app/api/cases/[caseId]/document-requests/[requestId]/versions/route.ts",
        "app/api/cases/[caseId]/document-versions/[versionId]/download/route.ts",
        "app/api/documents/[id]/route.ts",
        "app/api/documents/[id]/view/route.ts",
        "app/api/documents/upload/route.ts",
        // MV-193 — Stage 5 slice 1. Audit-only service-role: the invitation row itself
        // is written on the authenticated client through the policy.
        "app/api/cases/[caseId]/invitations/route.ts",
        "app/api/cases/[caseId]/invitations/[invitationId]/route.ts",
        // MV-194 — Stage 5 slice 2. Service-role does the tenant-table writes here, not
        // just the audit row: `accepted_at` and `student_user_id` are in no client grant.
        "app/api/invitations/accept/route.ts",
      ].sort(),
    );
  });
});
