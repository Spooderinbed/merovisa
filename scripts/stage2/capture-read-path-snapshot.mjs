#!/usr/bin/env node
/**
 * MV-160 §A2 — the LIVE half of the Stage 2 data-equivalence proof: the driver.
 *
 * `npm run stage2:equivalence`. Run BY HAND by the integrator on the rehearsal
 * host, against a restored copy of production, as a gate on the production
 * apply. It captures every student-facing read path AS each student — RLS-scoped
 * rather than service-role, which is the whole point — before the migration,
 * then replays and diffs after it.
 *
 * This file is the DRIVER ONLY. The serializer, the hash, the exclusion list and
 * the diff — the things the proof actually rests on — live in
 * `./read-path-snapshot.mjs`, which §A1
 * (`tests/integration/stage2-data-equivalence.itest.ts`) imports too. A synthetic
 * proof running different comparison code from the real one proves that the
 * fixtures are equal, not that the comparison is right. Hence one module, two
 * drivers; read that file's header for the map of the proof and the unit it
 * compares.
 *
 * WHY THE SPLIT IS A SPLIT (MV-192). The shebang on line 1 is the reason. On a
 * CRLF working tree the vitest SSR transform does not strip a `#!` line
 * correctly, so a test that imports THIS file dies with `SyntaxError: Invalid or
 * unexpected token` — on Windows only, while Linux CI's LF checkout passes, which
 * is how §A1 stayed silently dead locally for months while CI was green. Keep the
 * shebang and the CLI here; keep everything importable there. Do not merge them
 * back, and do not copy shared logic across.
 *
 * ## WHY §A2 IS DELIBERATELY NOT A TEST FILE AND NOT IN CI
 *
 * Do not "fix the gap" by wiring this into `npm run test:integration`.
 *
 * §A2 needs a pre-migration snapshot captured from real production data. That
 * artifact is real student PII — profile sections, names, emails, financial and
 * academic detail — so it is written to a gitignored path and DESTROYED on the
 * rehearsal host once the report is produced. It is therefore absent on every
 * CI run. A CI test that skipped when it is absent would skip on every run, and
 * this repo's integration lane scores a skipped suite as RED (the `0 skipped` /
 * `✓ <suite>` fail-closed guards in `.github/workflows/ci.yml`). The only cheap
 * way out of a permanently red lane is to weaken those guards — the guards every
 * other integration suite depends on. So the proof is split by what each half
 * can honestly prove, and this half lives outside the lane on purpose.
 *
 * MV-160 card §A, Decision log 2026-08-02 ("the equivalence proof is SPLIT").
 */

import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { assertCaptureHostAllowed } from "./capture-host-guard.mjs";
import { captureSnapshot, diffSnapshots, formatDiff } from "./read-path-snapshot.mjs";

const base64url = (buf) => Buffer.from(buf).toString("base64url");

/**
 * Mint an `authenticated` access token for one user, offline, from the project's
 * JWT secret.
 *
 * Deliberately not `admin.generateLink` + `verifyOtp`: this capture must be
 * READ-ONLY against the rehearsal copy, and the magic-link path writes auth
 * rows. Deliberately not the service-role key either — the whole point of the
 * replay is that it is RLS-scoped as the student.
 */
export function mintAccessToken(userId, jwtSecret, { expiresInSeconds = 3600, nowSeconds } = {}) {
  const iat = nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated", iat, exp: iat + expiresInSeconds }),
  );
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. See MV-160 card §A2 / the equivalence report.`);
  return value;
}

async function runCli(argv) {
  const { createClient } = await import("@supabase/supabase-js");
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i]?.startsWith("--")) args.set(argv[i].slice(2), argv[i + 1]?.startsWith("--") ? "true" : argv[i + 1]);
  }

  const url = requireEnv("SUPABASE_URL");

  // MV-164. BEFORE any client is constructed and before any user is enumerated:
  // refuse production outright, allow a local stack, and require --rehearsal-host
  // for anything else. Throws on refusal — see `capture-host-guard.mjs` for why
  // prose in a comment was not enough.
  //
  // `args.has`, not `args.get`: the parser above stores `undefined` for a flag in
  // TRAILING position, so `get` would read a correctly-typed
  // `… --snapshot <path> --rehearsal-host` as absent.
  assertCaptureHostAllowed(url, { rehearsalHostAcknowledged: args.has("rehearsal-host") });

  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const jwtSecret = requireEnv("SUPABASE_JWT_SECRET");

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  // The label is the PSEUDONYM that goes in the committed report; the raw user
  // id never does. Sorting by id makes the labels stable across the capture and
  // the replay, which are two separate runs hours or days apart.
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error(`could not list Auth users: ${listError.message}`);
  const users = listed.users
    .map((u) => u.id)
    .sort()
    .map((userId, index) => ({ label: `student-${String(index + 1).padStart(2, "0")}`, userId }));

  const read = async (table, userId) => {
    const scoped = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${mintAccessToken(userId, jwtSecret)}` } },
    });
    const { data, error } = await scoped.from(table).select("*");
    if (error) throw new Error(`RLS-scoped read of ${table} for ${userId} failed: ${error.message}`);
    return data ?? [];
  };

  const readAnonymousAssessmentIds = async () => {
    const { data, error } = await admin.from("assessments").select("id").is("owner", null);
    if (error) throw new Error(`anonymous assessment capture failed: ${error.message}`);
    return (data ?? []).map((row) => row.id);
  };

  const snapshot = await captureSnapshot({ users, read, readAnonymousAssessmentIds });

  const out = args.get("out");
  if (out) {
    writeFileSync(out, JSON.stringify(snapshot, null, 2), "utf8");
    process.stdout.write(
      `captured ${users.length} user(s), ${snapshot.anonymousAssessmentIds.length} anonymous assessment(s)\n` +
        `whole-snapshot hash: ${snapshot.hash}\n` +
        `written to ${out} — THIS FILE IS REAL STUDENT PII. It is gitignored; destroy it once the report is written.\n`,
    );
    return 0;
  }

  const snapshotPath = args.get("snapshot");
  if (!snapshotPath) {
    process.stderr.write(
      "usage:\n" +
        "  BEFORE the first Stage 2 migration:  npm run stage2:equivalence -- --capture --out <path>\n" +
        "  AFTER the Stage 2 migrations:        npm run stage2:equivalence -- --snapshot <path>\n" +
        "\n" +
        "  --rehearsal-host   required when SUPABASE_URL is neither localhost nor 127.0.0.1, to confirm the\n" +
        "                     target is the OFFLINE RESTORED COPY. Production is refused with or without it.\n",
    );
    return 2;
  }

  const before = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const diffs = diffSnapshots(before, snapshot);
  process.stdout.write(
    `pre-migration  hash: ${before.hash}\npost-migration hash: ${snapshot.hash}\n` +
      `anonymous assessments: ${before.anonymousAssessmentIds?.length ?? 0} -> ${snapshot.anonymousAssessmentIds.length}\n` +
      `${formatDiff(diffs)}\n`,
  );
  return diffs.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exit(1);
    },
  );
}
