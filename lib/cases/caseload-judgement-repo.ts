import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { planStatesForChecklist, type LinkedPlanState } from "@/lib/checklist/plan-links";
import type { DocumentKind } from "@/lib/documents/types";
import {
  deriveSubmittability,
  preferredShortlistTier,
  type SubmittabilityRead,
} from "@/lib/judgement/submittability";
import { visaRiskFromSections, type VisaRiskRead } from "@/lib/judgement/visa-risk";
import type { PlanItemRow } from "@/lib/plan/types";
import type { ProfileSections } from "@/lib/profiles/sections";
import type { Program } from "@/lib/programs/types";
import type { ShortlistStatus } from "@/lib/matches/repo";
import type { CaseAuthorizationClient } from "./context";

/**
 * The caseload's judgement enrichment (MV-200) — both judgement reads for a whole page
 * of cases, in a number of queries bounded by TABLES rather than by rows.
 *
 * ## Why this exists at all
 *
 * MV-200's criterion 1 counted the alternative: `readCaseVisaRisk` spends one round trip
 * per case and `readCaseSubmittability` spends six (more, when a case shortlists several
 * programs — `getProgram` runs once per candidate). At `LIST_ROW_CAP` of 500 that is up
 * to 3,500 sequential round trips to render one list. The card's own warning — "a
 * correct answer that takes eight seconds to list forty students fails the card" — is
 * that number.
 *
 * Five of the six sources are keyed by `case_id`, so one `.in()` per chunk answers for a
 * whole page; `programs` is a catalogue keyed by program id and is read once for the
 * page rather than once per case. This is the shape three of the queue's enrichments
 * already use (`queue-repo.ts`), not a new architecture.
 *
 * ## The judgement is the SAME function, only the I/O differs
 *
 * Criterion 3 forbids "parallel re-derivation", and it would have been easy to commit
 * here: the visa read's emptiness rule used to live inside `readCaseVisaRisk`. MV-200
 * extracted it to `visaRiskFromSections` instead, so both paths reach one answer through
 * one function; `deriveSubmittability` and `preferredShortlistTier` were already pure and
 * are called unchanged. A test asserts the batched answers equal the per-case readers'
 * answers row for row — because the failure this prevents is the queue and the case
 * saying different things about the same student.
 *
 * ## Why the plan read carries no status filter
 *
 * `listCaseQueue` reads `plan_items` filtered `status = 'todo'`, because all it wants is
 * the next action. This read wants the opposite end: `planStatesForChecklist` completes a
 * checklist row when its linked plan item is `done`, and a `todo`-filtered read contains
 * no `done` row by construction. Reusing the queue's rows would have reported every
 * plan-linked requirement as outstanding on every case — a wrong denominator on every
 * row, with no error and nothing on screen to suggest it. Measured in
 * `tests/judgement/caseload-rollup-measurement.test.ts`; pinned again here.
 *
 * ## Chunk sizes are not decoration
 *
 * PostgREST's `max_rows` truncates SILENTLY, and a truncated batch drops rows from the
 * cases at the tail of the chunk — which would render a fully-evidenced case as having
 * nothing. Unlike the outstanding-requests batch, none of these reads has a natural
 * database-side filter to bound it: every document, status row and plan item on a case is
 * load-bearing. So the many-rows-per-case reads chunk SMALLER, and every read trips into
 * `lookup-failed` at the ceiling rather than trusting a possibly-partial answer.
 */

/** One row per case: a profile, a handful of shortlist entries. */
const WIDE_BATCH_SIZE = 40;
/** Many rows per case, unbounded by the schema: documents, status ticks, plan items. */
const DEEP_BATCH_SIZE = 10;
/** PostgREST `max_rows` (supabase/config.toml). A read this long may be a silent prefix. */
export const JUDGEMENT_ROW_CEILING = 1000;

export interface CaseJudgement {
  visaRisk: VisaRiskRead;
  submittability: SubmittabilityRead;
}

export type CaseJudgementsResult =
  | { ok: true; byCase: Map<string, CaseJudgement> }
  | { ok: false; reason: "lookup-failed" };

const LOOKUP_FAILED = { ok: false, reason: "lookup-failed" } as const;

/** A PostgREST row, before it is mapped. The reads below select explicit columns. */
type Row = Record<string, unknown>;

export interface JudgementCaseRef {
  id: string;
  hasLinkedStudent: boolean;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Both judgements for every case given, keyed by case id.
 *
 * EVERY case gets an entry. Unlike `listOutstandingDocumentRequestsByCase`, where a case
 * with nothing outstanding is absent from the map, "nothing recorded" is itself one of
 * the answers here (`insufficient-data`, `no-program`), so a missing key could only mean
 * a bug.
 */
export async function listCaseJudgementsByCase(
  cases: readonly JudgementCaseRef[],
  db?: CaseAuthorizationClient,
): Promise<CaseJudgementsResult> {
  const byCase = new Map<string, CaseJudgement>();
  // No cases means no question. An empty `.in()` is a query that can only return
  // nothing, and PostgREST is not the place to find that out.
  if (cases.length === 0) return { ok: true, byCase };

  try {
    const supabase = db ?? (await createSupabaseServerClient());
    const ids = cases.map((c) => c.id);

    /**
     * One chunked `.in("case_id", …)` read, or null if it failed or may be a prefix.
     * `equals` adds one extra predicate at the database — only `document_status` needs
     * one, and it needs it there rather than in JavaScript so the ceiling below bounds
     * ticked boxes rather than every row the table has ever held.
     */
    async function readByCase(
      table: "profiles" | "user_program_state" | "documents" | "document_status" | "plan_items",
      columns: string,
      size: number,
      equals?: readonly [string, boolean],
    ): Promise<Row[] | null> {
      const all: Row[] = [];
      for (const batch of chunk(ids, size)) {
        const base = supabase.from(table).select(columns);
        const scoped = equals ? base.eq(equals[0], equals[1]) : base;
        const { data, error } = await scoped.in("case_id", batch);
        if (error) return null;
        const rows = (data ?? []) as unknown as Row[];
        // At the ceiling the answer MAY be a prefix, and PostgREST does not say so.
        if (rows.length >= JUDGEMENT_ROW_CEILING) return null;
        all.push(...rows);
      }
      return all;
    }

    const profileRows = await readByCase("profiles", "case_id, sections", WIDE_BATCH_SIZE);
    if (profileRows === null) return LOOKUP_FAILED;
    const sectionsByCase = new Map<string, ProfileSections>();
    for (const row of profileRows) {
      const sections = row.sections as ProfileSections | null | undefined;
      if (sections) sectionsByCase.set(row.case_id as string, sections);
    }

    const shortlistRows = await readByCase(
      "user_program_state",
      "case_id, program_id, status",
      WIDE_BATCH_SIZE,
    );
    if (shortlistRows === null) return LOOKUP_FAILED;
    const shortlistByCase = new Map<string, { programId: string; status: ShortlistStatus }[]>();
    for (const row of shortlistRows) {
      const caseId = row.case_id as string;
      const entries = shortlistByCase.get(caseId) ?? [];
      entries.push({ programId: row.program_id as string, status: row.status as ShortlistStatus });
      shortlistByCase.set(caseId, entries);
    }

    // The tier is resolved BEFORE the catalogue read, so only programs that could
    // actually be named are fetched — and only once for the whole page.
    const tierByCase = new Map<string, readonly string[]>();
    const wantedProgramIds = new Set<string>();
    for (const { id } of cases) {
      const tier = preferredShortlistTier(shortlistByCase.get(id) ?? []);
      tierByCase.set(id, tier);
      for (const programId of tier) wantedProgramIds.add(programId);
    }

    const programById = new Map<string, Program>();
    if (wantedProgramIds.size > 0) {
      for (const batch of chunk([...wantedProgramIds], WIDE_BATCH_SIZE)) {
        const { data, error } = await supabase.from("programs").select("*").in("id", batch);
        if (error) return LOOKUP_FAILED;
        for (const row of data ?? []) programById.set(row.id, mapProgram(row));
      }
    }

    const documentRows = await readByCase("documents", "case_id, kind", DEEP_BATCH_SIZE);
    if (documentRows === null) return LOOKUP_FAILED;
    const uploadedByCase = new Map<string, Set<DocumentKind>>();
    for (const row of documentRows) {
      const caseId = row.case_id as string;
      const kinds = uploadedByCase.get(caseId) ?? new Set<DocumentKind>();
      kinds.add(row.kind as DocumentKind);
      uploadedByCase.set(caseId, kinds);
    }

    const statusRows = await readByCase(
      "document_status",
      "case_id, kind",
      DEEP_BATCH_SIZE,
      ["obtained", true],
    );
    if (statusRows === null) return LOOKUP_FAILED;
    const obtainedByCase = new Map<string, Set<DocumentKind>>();
    for (const row of statusRows) {
      const caseId = row.case_id as string;
      const kinds = obtainedByCase.get(caseId) ?? new Set<DocumentKind>();
      kinds.add(row.kind as DocumentKind);
      obtainedByCase.set(caseId, kinds);
    }

    // NO status filter — see the header. `done` is what completes a plan-linked row.
    const planRows = await readByCase(
      "plan_items",
      "id, case_id, kind, impact, title, status, created_at, started_at",
      DEEP_BATCH_SIZE,
    );
    if (planRows === null) return LOOKUP_FAILED;
    const planByCase = new Map<string, PlanItemRow[]>();
    for (const row of planRows) {
      const caseId = row.case_id as string | null;
      if (caseId === null) continue;
      const items = planByCase.get(caseId) ?? [];
      // Only the columns `planStatesForChecklist` reads travel; the rest are nulled
      // rather than fetched, exactly as the queue's own plan read does.
      items.push({
        id: row.id as number,
        owner: null,
        kind: row.kind as string,
        impact: row.impact as PlanItemRow["impact"],
        title: row.title as string,
        body: null,
        liftEstimate: null,
        timeEstimate: null,
        status: row.status as PlanItemRow["status"],
        createdAt: (row.created_at as string | null) ?? "",
        completedAt: null,
        startedAt: (row.started_at as string | null) ?? null,
      });
      planByCase.set(caseId, items);
    }

    for (const { id, hasLinkedStudent } of cases) {
      const sections = sectionsByCase.get(id) ?? null;
      const planStates: Record<string, LinkedPlanState> = planStatesForChecklist(
        planByCase.get(id) ?? [],
      );
      byCase.set(id, {
        visaRisk: visaRiskFromSections({ hasLinkedStudent, sections }),
        submittability: deriveSubmittability({
          // A shortlisted program that has left the catalogue is not a program this read
          // can state anything about; if that empties the list, the derive says so.
          programs: (tierByCase.get(id) ?? [])
            .map((programId) => programById.get(programId))
            .filter((program): program is Program => program !== undefined),
          sections: sections ?? {},
          uploadedKinds: uploadedByCase.get(id) ?? new Set<DocumentKind>(),
          obtainedKinds: obtainedByCase.get(id) ?? new Set<DocumentKind>(),
          planStates,
        }),
      });
    }

    return { ok: true, byCase };
  } catch {
    // A thrown client, an aborted request — an answer that never arrived is an outage,
    // never a caseload with nothing on it.
    return LOOKUP_FAILED;
  }
}

/**
 * Local, because `lib/programs/repo.ts` keeps its mapper private and this read fetches
 * the catalogue by a different predicate. The column list is the same one that file
 * maps; a divergence would show up as a program rendering differently in the two places.
 */
function mapProgram(r: Record<string, unknown>): Program {
  return {
    id: r.id as string,
    universityId: r.university_id as string,
    name: r.name as string,
    level: r.level as Program["level"],
    field: r.field as string,
    tuitionMin: r.tuition_min == null ? null : Number(r.tuition_min),
    tuitionMax: r.tuition_max == null ? null : Number(r.tuition_max),
    tuitionCurrency: r.tuition_currency as "AUD",
    minGrade: r.min_grade as number | null,
    minEnglish: r.min_english == null ? null : Number(r.min_english),
    minEnglishBand: r.min_english_band == null ? null : Number(r.min_english_band),
    intakes: (r.intakes ?? []) as string[],
    source: (r.source as string | null) ?? "",
    lastVerified: (r.last_verified as string | null) ?? "",
    dataQuality: r.data_quality as Program["dataQuality"],
    notes: (r.notes as string | null) ?? null,
    durationYears: r.duration_years == null ? null : Number(r.duration_years),
    findingRefs: (r.finding_refs ?? []) as string[],
    generated: (r.generated as boolean | null) ?? false,
  };
}
