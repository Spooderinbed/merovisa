/**
 * MV-164 — the host guard for the MV-160 §A2 capture driver.
 *
 * ## What this protects against
 *
 * `capture-read-path-snapshot.mjs` holds the service-role key, enumerates EVERY
 * Auth user, reads all nine student read paths for each one, and writes the result
 * to a JSON file. That payload is real students' profile sections, names, emails,
 * financial and academic detail (`docs/migrations/stage2/equivalence-report.md`
 * §5). It is a REHEARSAL-ONLY driver, run by hand by the integrator against a
 * restored, offline copy of production.
 *
 * Until this guard existed, the only thing that said so was prose — a comment at
 * the top of the script and a paragraph in the runbook. Nothing stopped someone
 * exporting production credentials and running the copy-pasteable command from
 * that same runbook, at which point the script cheerfully performs a
 * full-population personal-data extraction from production. That would contradict
 * the layered controller model in `docs/legal/2026-07-29-stage0-decision-record.md`
 * D-A, and the report's own §5.
 *
 * ## Why it is a separate, import-free module
 *
 * So the refusal is provable by a plain unit test with no database, no env and no
 * client — and so §A1's serializer, hash and exclusion list stay untouched. Those
 * must remain byte-identical between the CI half of the proof and the rehearsal
 * half; editing them would invalidate the §A1 green record. This file imports
 * nothing.
 *
 * ## The rule
 *
 *   production ref  ->  REFUSE, with no override
 *   localhost       ->  allow (the ordinary path)
 *   any other host  ->  REFUSE unless `--rehearsal-host` was passed
 *
 * The middle case is not "localhost only" on purpose: a restored copy may
 * legitimately live on its own hosted Supabase project. Choosing a remote target
 * just has to be a visible, deliberate act rather than the default.
 */

/**
 * The live production project. Hardcoded, deliberately: an env-var-driven
 * "which project is production" setting is settable by the very person the guard
 * exists to stop, and the ref is not a secret — it is the public subdomain of the
 * project's API host and already appears throughout `docs/kanban/cards/`. If the
 * production project is ever migrated, this constant moves with it.
 */
export const PRODUCTION_PROJECT_REF = "obfvrxixtautamflzxzq";

/**
 * Hosts that are unambiguously a local Supabase stack. `[::1]` carries the
 * brackets because that is what `URL.hostname` returns for an IPv6 literal.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The hostname, lowercased — or `null` when the value is not a parseable URL.
 *
 * Parsing rather than string-matching is the point. A substring test over the
 * whole URL is wrong in both directions: it refuses a local URL that merely
 * mentions the ref in a query string, and it invites the mirror-image mistake of
 * matching a hostname PREFIX, which cannot tell one project from another whose
 * ref happens to start the same way.
 */
function hostOf(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  try {
    return new URL(rawUrl.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when the production ref is a WHOLE label of the host.
 *
 * Whole-label, not prefix: `obfvrxixtautamflzxzq-copy.supabase.co` is a different
 * project and must not be reported as production. Any label, not just the first:
 * Supabase's direct-connection host is `db.<ref>.supabase.co`, and matching only
 * the first label would wave it through.
 */
function isProductionHost(host) {
  return host.split(".").includes(PRODUCTION_PROJECT_REF);
}

/**
 * Classify the capture target.
 *
 * @param rawUrl  the value of `SUPABASE_URL`.
 * @param options `{ rehearsalHostAcknowledged }` — the `--rehearsal-host` opt-in.
 * @returns `{ allowed, code, host, reason }`. `code` is one of `production`,
 *          `local`, `acknowledged-remote`, `unacknowledged-remote`, `unparseable`,
 *          so a caller (and a test) can tell WHICH rule fired rather than only
 *          that something did.
 */
export function checkCaptureHost(rawUrl, { rehearsalHostAcknowledged = false } = {}) {
  const host = hostOf(rawUrl);

  if (host === null) {
    return {
      allowed: false,
      code: "unparseable",
      host: null,
      reason:
        `REFUSING: SUPABASE_URL is not a parseable URL (${JSON.stringify(rawUrl)}), so this guard cannot tell ` +
        `production from the rehearsal copy, and it will not guess. Set SUPABASE_URL to a full origin including ` +
        `the scheme — e.g. http://127.0.0.1:54321 for the local stack.`,
    };
  }

  // FIRST, and before the opt-in is even read. The flag acknowledges that a
  // remote host is the restored copy; production never is, so the flag must not
  // double as a bypass.
  if (isProductionHost(host)) {
    return {
      allowed: false,
      code: "production",
      host,
      reason:
        `REFUSING: SUPABASE_URL points at the PRODUCTION project (host "${host}", ref ` +
        `"${PRODUCTION_PROJECT_REF}"). This script enumerates every Auth user and reads all nine student read ` +
        `paths for each one, so running it here would extract the whole population's personal data — profile ` +
        `sections, names, emails, financial and academic detail. It is the rehearsal-only MV-160 §A2 driver and ` +
        `is not an application path. THERE IS NO OVERRIDE, --rehearsal-host included. Restore a copy of ` +
        `production onto a rehearsal host and point SUPABASE_URL at that copy instead.`,
    };
  }

  if (LOCAL_HOSTS.has(host)) {
    return { allowed: true, code: "local", host, reason: `Allowed: "${host}" is a local Supabase stack.` };
  }

  if (rehearsalHostAcknowledged) {
    return {
      allowed: true,
      code: "acknowledged-remote",
      host,
      reason:
        `Allowed: "${host}" is a remote host, accepted because --rehearsal-host was passed. It must be an ` +
        `OFFLINE RESTORED COPY, never a project serving live students.`,
    };
  }

  return {
    allowed: false,
    code: "unacknowledged-remote",
    host,
    reason:
      `REFUSING: SUPABASE_URL points at the remote host "${host}", which is neither a local stack nor a target ` +
      `this run acknowledged. This script reads every student's data, so aiming it at a remote project has to be ` +
      `a deliberate act. If "${host}" really is the restored rehearsal copy, re-run the same command with ` +
      `--rehearsal-host. If you meant the local stack, set SUPABASE_URL to http://127.0.0.1:54321.`,
  };
}

/**
 * `checkCaptureHost` plus the throw. Returning a verdict nobody acts on is not a
 * guard, so this is the seam the CLI calls — before it constructs any client and
 * before it enumerates any user.
 */
export function assertCaptureHostAllowed(rawUrl, options) {
  const verdict = checkCaptureHost(rawUrl, options);
  if (!verdict.allowed) throw new Error(verdict.reason);
  return verdict;
}
