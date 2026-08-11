"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Which case are the controls on this page writing to?
 *
 * ## Why this exists, and why it is a context rather than a prop
 *
 * MV-172 renders the existing student experience — profile, matches, plan,
 * checklist — inside a counsellor's case route. The server pages know the case
 * id; the five controls that WRITE are client components buried three and four
 * levels down inside server-rendered trees (`VerdictGroup` → `ProgramCard` →
 * `ShortlistButton`, the eight profile editors → `useSectionSave`). Threading an
 * id through all of them would touch fifteen components to deliver one fact that
 * is constant for the whole subtree, and would leave fifteen chances to drop it.
 *
 * This is the repo's first `createContext`, and it is deliberate rather than
 * habitual: the fact is ambient request scope, which is the one thing a context
 * models better than a prop.
 *
 * ## The default is `null`, and that is the whole compatibility story
 *
 * `/matches`, `/plan`, `/checklist` and `/profile` render no provider, so
 * `useCaseScopeId()` returns `null`, `caseScoped()` adds nothing to the body, and
 * every route resolves the signed-in student's own personal case exactly as it
 * did before. The personal surfaces are unchanged by construction.
 *
 * ## What it is NOT
 *
 * Not authorization. The id travels to the server in a request body, where
 * `resolveTargetCase` re-derives the actor from the session and authorizes the
 * case through `checkCasePermission` and RLS. A forged value is refused there;
 * plan line 354 — "knowing a case ID grants no access" — is unaffected.
 *
 * Not a case-context INDICATOR either. Telling the viewer whose case they are in
 * is MV-173's, which owns it once, everywhere.
 */
const CaseScopeContext = createContext<string | null>(null);

export function CaseScopeProvider({ caseId, children }: { caseId: string; children: ReactNode }) {
  return <CaseScopeContext.Provider value={caseId}>{children}</CaseScopeContext.Provider>;
}

/** The case to name in a write, or `null` on the student's own surfaces. */
export function useCaseScopeId(): string | null {
  return useContext(CaseScopeContext);
}

/**
 * Add the case id to a request body — the ONE place it enters a payload.
 *
 * Outside a case scope the body is returned untouched, with **no `caseId` key at
 * all**. Sending `caseId: null` instead would be a different thing entirely:
 * `resolveTargetCase` treats a present-but-unusable id as malformed and answers
 * 400, so every student's save would fail. `tests/components/case-scoped-writes.test.tsx`
 * pins both halves.
 */
export function caseScoped<T extends object>(body: T, caseId: string | null): T {
  return caseId === null ? body : { ...body, caseId };
}
