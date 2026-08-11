import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * One guard for the identifiers that arrive as ROUTE SEGMENTS rather than in a
 * body — `[caseId]`, `[organizationId]`.
 *
 * ## Why a path id needs validating at all, when it is authorized against anyway
 *
 * Because the two failures answer differently, and without this the more broken
 * request got the kinder-sounding lie. `cases.id` and `organizations.id` are
 * `uuid` columns, so a malformed segment does not reach a policy decision at all:
 * Postgres raises `22P02 invalid input syntax for type uuid` inside the permission
 * lookup, `getCaseContext` reports that as `lookup-failed`, and
 * `caseDenialResponse` turns it into **500 "Could not check your access"** — an
 * outage on our side. Meanwhile a WELL-FORMED id that matches no row correctly
 * answers 404. So `/api/cases/xyz` blamed the server and `/api/cases/<a real
 * uuid>` blamed the request, exactly the wrong way round.
 *
 * 400 is the honest answer: the request is malformed, no retry will fix it, and it
 * is not a statement about the caller's access or about whether the case exists.
 *
 * ## Why it runs FIRST
 *
 * Before the client is built and before any query. That keeps the property
 * `tests/api/case-denial.test.ts` pins for every gated route — a request that does
 * not get to a decision costs zero reads — and it means a probe cannot spend a
 * database round trip on a value that was never a candidate.
 *
 * It is NOT authorization and must never be mistaken for it: a well-formed uuid
 * passes here and is then decided by `checkCasePermission` and by RLS. Plan line
 * 354 — "knowing a case ID grants no access" — is unaffected either way.
 *
 * No `server-only`: a format check carries no rule that must be hidden from client
 * JS, the same reasoning `./route-denial.ts` gives for staying unmarked.
 */

const PathId = z.uuid();

/**
 * A 400 when `value` is not a uuid, or `null` when it is — so a call site reads
 *
 * ```ts
 * const malformed = malformedPathId(caseId);
 * if (malformed) return malformed;
 * ```
 *
 * and cannot accidentally treat "valid" as falsy the way a bare boolean invites.
 */
export function malformedPathId(value: unknown): Response | null {
  if (PathId.safeParse(value).success) return null;
  return NextResponse.json({ error: "Malformed identifier" }, { status: 400 });
}
