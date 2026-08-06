/**
 * MV-164 — the §A2 capture driver's host guard.
 *
 * `scripts/stage2/capture-read-path-snapshot.mjs` enumerates EVERY Auth user with
 * the service-role key and reads all nine student read paths for each one, then
 * writes the lot to a JSON file. Pointed at production that is a full-population
 * export of real student PII — profile sections, names, emails, financial and
 * academic detail (`docs/migrations/stage2/equivalence-report.md` §5) — which
 * contradicts `docs/legal/2026-07-29-stage0-decision-record.md` D-A.
 *
 * Before this guard, the ONLY thing marking the script rehearsal-only was prose in
 * its comments and in the runbook. Prose does not refuse. These tests pin the code
 * that does.
 *
 * WHY THE GUARD IS ITS OWN MODULE. It is a pure function over a URL string with no
 * imports at all, so it can be exercised with no database, no env and no client.
 * Keeping it out of the capture script also leaves §A1's serializer / hash /
 * exclusion list — which must stay byte-identical between the CI half and the
 * rehearsal half of the proof — completely untouched.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PRODUCTION_PROJECT_REF,
  checkCaptureHost,
  assertCaptureHostAllowed,
} from "../../scripts/stage2/capture-host-guard.mjs";

const REPO_ROOT = path.resolve(__dirname, "../..");
const PROD = "https://obfvrxixtautamflzxzq.supabase.co";
const ACKNOWLEDGED = { rehearsalHostAcknowledged: true };

describe("A — production is refused, and there is no way to talk it round", () => {
  test("the canonical production URL is refused", () => {
    const verdict = checkCaptureHost(PROD);
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe("production");
  });

  test("the opt-in flag does NOT unlock production", () => {
    // The whole point: --rehearsal-host acknowledges that a REMOTE host is the
    // restored copy. Production is never the restored copy, so the flag must not
    // double as a bypass. If this ever reports allowed, the guard has become a
    // speed bump.
    const verdict = checkCaptureHost(PROD, ACKNOWLEDGED);
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe("production");
  });

  test("the refusal names the host, the reason, and what to do instead", () => {
    const { reason } = checkCaptureHost(PROD);
    expect(reason).toContain("obfvrxixtautamflzxzq.supabase.co");
    expect(reason).toMatch(/production/i);
    expect(reason).toMatch(/rehearsal/i);
  });

  test("the production ref is exported as a named constant", () => {
    expect(PRODUCTION_PROJECT_REF).toBe("obfvrxixtautamflzxzq");
  });
});

describe("B — the local stack runs freely", () => {
  test.each([
    ["http://localhost:54321", "localhost"],
    ["http://127.0.0.1:54321", "127.0.0.1"],
    ["http://localhost:54321/", "localhost with a trailing slash"],
    ["http://[::1]:54321", "the IPv6 loopback"],
  ])("%s is allowed (%s)", (url) => {
    const verdict = checkCaptureHost(url);
    expect(verdict.allowed).toBe(true);
    expect(verdict.code).toBe("local");
  });

  test("no opt-in flag is needed for the ordinary local path", () => {
    expect(checkCaptureHost("http://127.0.0.1:54321").allowed).toBe(true);
  });
});

describe("C — any other remote host needs a deliberate opt-in", () => {
  const REHEARSAL = "https://rehearsalcopyabcdefgh.supabase.co";

  test("a remote host is refused by default", () => {
    const verdict = checkCaptureHost(REHEARSAL);
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe("unacknowledged-remote");
  });

  test("the same remote host is allowed once acknowledged", () => {
    const verdict = checkCaptureHost(REHEARSAL, ACKNOWLEDGED);
    expect(verdict.allowed).toBe(true);
    expect(verdict.code).toBe("acknowledged-remote");
  });

  test("the default refusal names the host and the flag that unlocks it", () => {
    const { reason } = checkCaptureHost(REHEARSAL);
    expect(reason).toContain("rehearsalcopyabcdefgh.supabase.co");
    expect(reason).toContain("--rehearsal-host");
  });
});

describe("D — the match is on the HOST, not a substring of the URL", () => {
  /**
   * A naive `url.includes(PRODUCTION_PROJECT_REF)` passes every test in group A
   * and is wrong in both directions: it refuses innocent URLs that merely mention
   * the ref, and a naive `hostname.startsWith` misclassifies a genuinely
   * different project. These are the cases that separate a host check from a text
   * search.
   */
  test("the ref appearing in the PATH is not production", () => {
    const verdict = checkCaptureHost("https://rehearsalcopyabcdefgh.supabase.co/obfvrxixtautamflzxzq", ACKNOWLEDGED);
    expect(verdict.allowed).toBe(true);
    expect(verdict.code).toBe("acknowledged-remote");
  });

  test("the ref appearing in the QUERY STRING of a local URL is not production", () => {
    const verdict = checkCaptureHost("http://127.0.0.1:54321/?note=obfvrxixtautamflzxzq");
    expect(verdict.allowed).toBe(true);
    expect(verdict.code).toBe("local");
  });

  test("a DIFFERENT project whose ref merely starts with the production ref is not production", () => {
    // `obfvrxixtautamflzxzq-copy` is a different DNS label and therefore a
    // different project. It is remote, so it still needs the flag — but it must
    // be refused as "remote", not mislabelled as production.
    const verdict = checkCaptureHost("https://obfvrxixtautamflzxzq-copy.supabase.co");
    expect(verdict.code).toBe("unacknowledged-remote");
    expect(checkCaptureHost("https://obfvrxixtautamflzxzq-copy.supabase.co", ACKNOWLEDGED).allowed).toBe(true);
  });

  test("the production ref as ANY whole host label is production", () => {
    // Supabase's direct-connection host is `db.<ref>.supabase.co`. Matching only
    // the first label would wave it through.
    expect(checkCaptureHost("https://db.obfvrxixtautamflzxzq.supabase.co").code).toBe("production");
  });

  test("a trailing slash does not hide production", () => {
    expect(checkCaptureHost(`${PROD}/`).code).toBe("production");
  });

  test("uppercase does not hide production", () => {
    expect(checkCaptureHost("HTTPS://OBFVRXIXTAUTAMFLZXZQ.SUPABASE.CO").code).toBe("production");
    expect(checkCaptureHost("https://ObfVrxIxtautAmflzxzq.supabase.co/").code).toBe("production");
  });

  test("a port and a path do not hide production", () => {
    expect(checkCaptureHost("https://obfvrxixtautamflzxzq.supabase.co:443/rest/v1").code).toBe("production");
  });

  test("surrounding whitespace does not hide production", () => {
    // A pasted env var keeps its trailing newline more often than anyone expects.
    expect(checkCaptureHost(`  ${PROD}\n`).code).toBe("production");
  });
});

describe("E — an unclassifiable URL fails closed", () => {
  test.each([
    ["", "empty"],
    ["obfvrxixtautamflzxzq.supabase.co", "no scheme, so not parseable as a URL"],
    ["not a url at all", "nonsense"],
  ])("%s is refused (%s)", (url) => {
    const verdict = checkCaptureHost(url);
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe("unparseable");
  });

  test("a non-string is refused rather than coerced", () => {
    // `SUPABASE_URL` is `string | undefined` at the source, and the guard is a
    // plain .mjs module, so TypeScript is not standing between a missing env var
    // and this function. It must refuse rather than throw its way past its own
    // refusal.
    expect(checkCaptureHost(undefined).code).toBe("unparseable");
  });

  test("the refusal says what a valid value looks like", () => {
    expect(checkCaptureHost("not a url at all").reason).toContain("SUPABASE_URL");
  });
});

describe("F — the refusal actually stops the run", () => {
  /**
   * `checkCaptureHost` returning `{allowed:false}` is inert on its own — something
   * has to throw. That conversion is `assertCaptureHostAllowed`, and it is what
   * the CLI calls.
   */
  test("assertCaptureHostAllowed throws on production", () => {
    expect(() => assertCaptureHostAllowed(PROD)).toThrow(/production/i);
  });

  test("it throws on production even when the host is acknowledged", () => {
    expect(() => assertCaptureHostAllowed(PROD, ACKNOWLEDGED)).toThrow(/production/i);
  });

  test("it throws on an unacknowledged remote host", () => {
    expect(() => assertCaptureHostAllowed("https://rehearsalcopyabcdefgh.supabase.co")).toThrow(/--rehearsal-host/);
  });

  test("it returns the verdict, and does not throw, for the local stack", () => {
    expect(assertCaptureHostAllowed("http://127.0.0.1:54321").code).toBe("local");
  });
});

describe("G — the guard is WIRED UP, before any client and any user enumeration", () => {
  /**
   * Every assertion above passes against a guard that is exported and never
   * called. This repo has been bitten by exactly that shape before — a
   * denial-only RLS suite passes identically against a MISSING policy — so the
   * wiring is asserted structurally, against the capture script's own source.
   */
  const SCRIPT = "scripts/stage2/capture-read-path-snapshot.mjs";
  const source = readFileSync(path.join(REPO_ROOT, SCRIPT), "utf8");

  test("the capture script imports the guard", () => {
    expect(source, `${SCRIPT} must import the guard`).toContain("capture-host-guard.mjs");
    expect(source).toContain("assertCaptureHostAllowed");
  });

  test("it calls the guard BEFORE it constructs any Supabase client", () => {
    const guardAt = source.indexOf("assertCaptureHostAllowed(url");
    const firstClientAt = source.indexOf("createClient(url");
    expect(guardAt, "the guard call is missing").toBeGreaterThan(-1);
    expect(firstClientAt, "the CLI no longer constructs a client — re-check this test").toBeGreaterThan(-1);
    expect(guardAt, "a client is constructed before the host is checked").toBeLessThan(firstClientAt);
  });

  test("it calls the guard BEFORE it enumerates Auth users", () => {
    const guardAt = source.indexOf("assertCaptureHostAllowed(url");
    const listAt = source.indexOf("auth.admin.listUsers");
    expect(guardAt, "the guard call is missing").toBeGreaterThan(-1);
    expect(listAt, "the CLI no longer enumerates users — re-check this test").toBeGreaterThan(-1);
    expect(guardAt, "users are enumerated before the host is checked").toBeLessThan(listAt);
  });

  test("the CLI reads the opt-in with has(), not a truthy value", () => {
    // The existing arg parser stores `undefined` for a TRAILING `--flag`, so
    // `args.get("rehearsal-host")` is falsy for a command that ends in
    // `--rehearsal-host`. That fails closed rather than open, but it makes a
    // correctly-typed command refuse for a reason nobody can see.
    expect(source).toContain('args.has("rehearsal-host")');
  });

  test("the usage text tells the operator the flag exists", () => {
    expect(source).toContain("--rehearsal-host");
  });
});
