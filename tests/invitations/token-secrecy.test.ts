import { describe, test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import {
  INVITATION_TTL_DAYS,
  hashInvitationToken,
  mintInvitationToken,
} from "@/lib/invitations/token";
import {
  createStudentInvitation,
  listCaseInvitations,
  revokeCaseInvitation,
} from "@/lib/cases/invitations-repo";
import { fakeCaseDb, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * MV-193 — **THE test this slice exists for**, written before the implementation
 * (card, "The trap this card is mostly about").
 *
 * `invitations.token_hash` is named that for a reason. The entire security value of
 * the design is that **a database reader cannot mint a working link** — not a
 * compromised backup, not an over-broad service-role query, not a future audit
 * export. Store the plaintext in the row, log it, return it from a list endpoint, or
 * put it in an audit payload, and *every functional test in this repo stays green*
 * while the property is gone. That is the failure mode this file hunts.
 *
 * ## Why the assertions are runtime CAPTURES rather than source greps
 *
 * A grep for `token_hash` proves the identifier is spelled right, which is not the
 * question. The question is what VALUE went over the wire. So the fake client records
 * every insert payload, every update patch and every `.select()` projection, and the
 * assertions ask whether the plaintext appears anywhere in what the repository sent —
 * a question no amount of careful naming can answer wrongly and still pass.
 *
 * The one place a source scan IS the right instrument is the log sweep at the bottom:
 * a `console.log(token)` sends the value somewhere no fake can observe.
 *
 * ## The CRLF trap, which applies to exactly that scan
 *
 * This is a CRLF working tree (`autocrlf=true`, no `.gitattributes`). `split("\n")`
 * returns ONE element here, so a line-oriented scan matches zero lines and every
 * assertion built on it goes **vacuously true** — green on Linux CI, green on
 * Windows, testing nothing. Every scan below splits on `/\r?\n/`, and the first test
 * in that block is the control that proves the split worked. MISTAKES.md records this
 * costing real time already.
 */

const CASE_A = "11111111-1111-4111-8111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const EMAIL = "student@example.test";

function fixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [{ id: CASE_A, organization_id: ORG_A }],
    invitations: [],
    ...overrides,
  };
}

/**
 * Every string anywhere inside a recorded payload, however deeply nested.
 *
 * Flattening rather than checking known keys is deliberate: a defect that put the
 * plaintext under a column nobody thought of — `email`, a stray `metadata`, a
 * misspelled `token_hash` — is exactly the defect a key-by-key check would miss.
 */
function stringsIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, found);
  else if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) stringsIn(nested, found);
  }
  return found;
}

describe("MV-193 criterion 3 — the plaintext token is not recoverable from the database", () => {
  test("the stored token_hash does not equal the token that was returned", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createStudentInvitation(ACTOR, CASE_A, EMAIL, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = inserts.find((i) => i.table === "invitations");
    expect(stored, "no invitation row was written").toBeDefined();
    expect(stored!.row.token_hash).toBeDefined();
    expect(stored!.row.token_hash).not.toBe(result.token);
  });

  test("NO column of the written row carries the token — not just token_hash", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createStudentInvitation(ACTOR, CASE_A, EMAIL, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = inserts.find((i) => i.table === "invitations");
    for (const [column, value] of Object.entries(stored!.row)) {
      expect(String(value), `column \`${column}\` carries the plaintext token`).not.toContain(
        result.token,
      );
    }
  });

  test("nothing sent to the database ANYWHERE contains the token — inserts, patches, filters", async () => {
    const { client, inserts, updates, queries } = fakeCaseDb(fixture());

    const result = await createStudentInvitation(ACTOR, CASE_A, EMAIL, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sent = [
      ...stringsIn(inserts),
      ...stringsIn(updates),
      ...stringsIn(queries.map((q) => q.filters)),
    ];
    // The control: the sweep can see something. A `stringsIn` that returned [] would
    // satisfy the assertion below against an implementation that stored the token in
    // every column.
    expect(sent.length).toBeGreaterThan(3);
    for (const value of sent) {
      expect(value, "a value carrying the plaintext token reached the database").not.toContain(
        result.token,
      );
    }
  });

  test("the read path never even ASKS PostgREST for token_hash", async () => {
    const { client, queries } = fakeCaseDb(
      fixture({
        invitations: [
          {
            id: "inv-1",
            case_id: CASE_A,
            organization_id: ORG_A,
            email: EMAIL,
            role: "student",
            token_hash: "a-real-looking-digest",
            expires_at: "2099-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const listed = await listCaseInvitations(CASE_A, client);

    expect(listed.ok).toBe(true);
    const projections = queries.filter((q) => q.table === "invitations").flatMap((q) => q.select);
    // The control: a read happened and it named its columns. `*` would defeat the
    // assertion below by asking for everything without spelling it.
    expect(projections.length).toBeGreaterThan(0);
    for (const projection of projections) {
      expect(projection, "the list query projects token_hash").not.toContain("token_hash");
      expect(projection, "the list query projects every column").not.toBe("*");
    }
  });

  test("a listed invitation carries no token field, whatever the row held", async () => {
    const { client } = fakeCaseDb(
      fixture({
        invitations: [
          {
            id: "inv-1",
            case_id: CASE_A,
            organization_id: ORG_A,
            email: EMAIL,
            role: "student",
            token_hash: "a-real-looking-digest",
            expires_at: "2099-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const listed = await listCaseInvitations(CASE_A, client);

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data).toHaveLength(1);
    const keys = Object.keys(listed.data[0]!);
    for (const key of keys) {
      expect(key.toLowerCase(), `the list surface exposes \`${key}\``).not.toContain("token");
    }
    // And the values, in case a digest ever rides under an innocent key.
    for (const value of stringsIn(listed.data)) {
      expect(value).not.toBe("a-real-looking-digest");
    }
  });

  test("criterion 4 — the token is returned by the MINT and by nothing else", async () => {
    const { client } = fakeCaseDb(fixture());

    const minted = await createStudentInvitation(ACTOR, CASE_A, EMAIL, client);
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;
    expect(typeof minted.token).toBe("string");
    expect(minted.token.length).toBeGreaterThan(20);

    // The same invitation, re-read through the product's own read path.
    const listed = await listCaseInvitations(CASE_A, client);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data).toHaveLength(1);
    for (const value of stringsIn(listed.data)) {
      expect(value, "a read path handed the token back a second time").not.toContain(minted.token);
    }

    // And through the revoke path, which also reads its row back.
    const revoked = await revokeCaseInvitation(listed.data[0]!.id, CASE_A, client);
    expect(revoked.ok).toBe(true);
    for (const value of stringsIn(revoked)) {
      expect(value, "the revoke result handed the token back").not.toContain(minted.token);
    }
  });
});

describe("MV-193 — the hash itself is a one-way function of a high-entropy token", () => {
  test("two mints never collide", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(mintInvitationToken().token);
    expect(seen.size).toBe(200);
  });

  test("hashing is deterministic, so slice 2 can look an invitation up by its token", () => {
    const { token, tokenHash } = mintInvitationToken();
    expect(hashInvitationToken(token)).toBe(tokenHash);
  });

  test("the digest reveals no prefix of the token", () => {
    const { token, tokenHash } = mintInvitationToken();
    expect(tokenHash).not.toContain(token);
    expect(token).not.toContain(tokenHash);
    // A digest, not an encoding: same length every time, whatever went in.
    expect(hashInvitationToken("x")).toHaveLength(tokenHash.length);
  });

  test("a different token hashes differently — the guard against a constant digest", () => {
    expect(hashInvitationToken("a")).not.toBe(hashInvitationToken("b"));
  });
});

/**
 * The log sweep. A `console.log(token)` puts the credential in Vercel's function logs,
 * where the whole point of hashing it in the database is defeated one layer up —
 * CLAUDE.md, "No sensitive data in URLs, query params, or client-side logs".
 *
 * SPLITS ON /\r?\n/ — see the header.
 */
const REPO_ROOT = join(__dirname, "..", "..");

const TOKEN_HANDLING_SOURCES = [
  "lib/invitations/token.ts",
  "lib/cases/invitations-repo.ts",
  "app/api/cases/[caseId]/invitations/route.ts",
  "app/api/cases/[caseId]/invitations/[invitationId]/route.ts",
  "components/workspace/case-invite-block.tsx",
];

const readLines = (relPath: string): string[] =>
  readFileSync(join(REPO_ROOT, relPath), "utf8").split(/\r?\n/);

const CONSOLE_CALL = /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/;

/**
 * Identifiers that hold, or could hold, the plaintext. `link` is here too and is the
 * subtle one: `invitationLink(origin, token)` embeds the token, so logging the LINK
 * leaks the credential exactly as logging the token would.
 */
const TOKEN_BEARING = ["token", "plaintext", "link", "invitationLink"];

/** Source lines with the comments stripped — a module may DISCUSS the token at length. */
const codeLines = (relPath: string): Array<{ line: string; number: number }> =>
  readLines(relPath)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    });

describe("MV-193 — the token reaches no log, on either side of the wire", () => {
  test("the scan splits a CRLF source file into many lines — the vacuous-green control", () => {
    const first = TOKEN_HANDLING_SOURCES[0];
    if (first === undefined) throw new Error("no sources to scan");
    expect(readLines(first).length).toBeGreaterThan(20);
  });

  test("the scan sees real code after stripping comments — the second vacuous-green control", () => {
    // These files are comment-heavy by house style. If the stripper ate everything, the
    // sweeps below would pass against a module that logged the token on every line.
    for (const relPath of TOKEN_HANDLING_SOURCES) {
      expect(codeLines(relPath).length, `${relPath} stripped down to nothing`).toBeGreaterThan(10);
    }
  });

  test.each(TOKEN_HANDLING_SOURCES)("%s passes no token-bearing value to a console call", (relPath) => {
    const offenders = codeLines(relPath)
      .filter(({ line }) => CONSOLE_CALL.test(line))
      .filter(({ line }) => TOKEN_BEARING.some((name) => new RegExp(`\\b${name}\\b`, "i").test(line)))
      .map(({ number }) => `${relPath}:${number}`);

    expect(offenders, "a console call carries the invitation credential").toEqual([]);
  });

  test("the sweep would catch a leak if one were there — it bites", () => {
    const planted = [
      { line: "const x = 1;", number: 1 },
      { line: "  console.log(token);", number: 2 },
      { line: "  console.error('mint failed');", number: 3 },
    ];
    const caught = planted
      .filter(({ line }) => CONSOLE_CALL.test(line))
      .filter(({ line }) => TOKEN_BEARING.some((name) => new RegExp(`\\b${name}\\b`, "i").test(line)));
    // Exactly the leaking line, and NOT the innocent diagnostic beside it — a sweep that
    // caught both would be a blanket console ban wearing a different hat, and would push
    // the next author to delete the fail-closed logging rather than keep the guarantee.
    expect(caught.map((c) => c.number)).toEqual([2]);
  });

  test("no token-bearing value is passed to writeAuditEvent — criterion 3's audit-payload half", () => {
    for (const relPath of TOKEN_HANDLING_SOURCES.filter((p) => p.startsWith("app/api/"))) {
      const source = codeLines(relPath).map((c) => c.line).join("\n");
      const start = source.indexOf("writeAuditEvent(");
      expect(start, `${relPath} writes no audit event`).toBeGreaterThan(-1);
      // Brace-balanced from the call opener, the same instrument
      // `tests/audit/audit-metadata-pii.test.ts` uses.
      let depth = 0;
      let end = start;
      for (let i = start; i < source.length; i += 1) {
        if (source[i] === "(") depth += 1;
        else if (source[i] === ")") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const block = source.slice(start, end + 1);
      for (const name of TOKEN_BEARING) {
        expect(block, `${relPath} passes \`${name}\` into an audit call`).not.toMatch(
          new RegExp(`\\b${name}\\b`, "i"),
        );
      }
    }
  });

  test("the mint route puts the token in a RESPONSE BODY, never in a URL or a redirect", () => {
    const source = readLines("app/api/cases/[caseId]/invitations/route.ts").join("\n");
    // A token in a query string lands in access logs, in `Referer` headers and in
    // browser history. The counsellor-side surface is a POST body and nothing else.
    expect(source).not.toContain("redirect(");
    expect(source).not.toContain("searchParams.set");
  });
});

describe("MV-193 criterion 5 — the expiry is a named constant with a stated reason", () => {
  test("the TTL is exported as a number, not written inline at the call site", () => {
    expect(typeof INVITATION_TTL_DAYS).toBe("number");
    expect(INVITATION_TTL_DAYS).toBeGreaterThan(0);
  });

  test("the constant's declaration carries the reason it is that number", () => {
    const source = readLines("lib/invitations/token.ts").join("\n");
    const declaration = source.indexOf("INVITATION_TTL_DAYS");
    expect(declaration).toBeGreaterThan(-1);
    // The doc comment above the constant. A magic number with no argument behind it
    // is what criterion 5 refuses, and prose is the only place the argument can live.
    expect(source.slice(Math.max(0, declaration - 1200), declaration)).toContain("*");
  });
});
