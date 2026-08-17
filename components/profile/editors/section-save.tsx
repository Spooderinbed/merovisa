"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { caseScoped, useCaseScopeId } from "@/components/cases/case-scope";
import type { SectionKey } from "@/lib/profiles/sections";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface GroupSaveEntry {
  section: SectionKey;
  patch: Record<string, unknown>;
}

const SAVED_VISIBLE_MS = 2000;

/**
 * Shared save lifecycle for profile group editors: PATCHes each dirty member
 * storage section sequentially (one request per section — the API stays
 * per-section), shows a single Saved/error notice for the whole group, and
 * refreshes server-rendered data (row summaries + completeness ring) once
 * after every PATCH succeeded. Returns whether the save fully succeeded so
 * callers can advance their dirty-tracking baseline.
 */
export function useGroupSave() {
  const router = useRouter();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The single choke point for all eight profile editors: they save through this
  // hook, so the case scope is read here once rather than threaded through each.
  // Null on /profile — the route then resolves the student's own case.
  const caseId = useCaseScopeId();

  useEffect(() => () => clearTimeout(timer.current), []);

  const saveSections = async (entries: GroupSaveEntry[]): Promise<boolean> => {
    clearTimeout(timer.current);
    setStatus("saving");
    for (const { section, patch } of entries) {
      const res = await fetch("/api/profile/section", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(caseScoped({ section, patch }, caseId)),
      }).catch(() => null);
      if (!res?.ok) {
        setStatus("error");
        return false;
      }
    }
    setStatus("saved");
    router.refresh();
    timer.current = setTimeout(() => setStatus("idle"), SAVED_VISIBLE_MS);
    return true;
  };

  return { status, saveSections };
}

/**
 * Single-section save lifecycle — the original hook, now composed over
 * useGroupSave so both share one PATCH + notice + refresh implementation.
 */
export function useSectionSave(section: SectionKey) {
  const { status, saveSections } = useGroupSave();

  const save = async (patch: Record<string, unknown>) => {
    await saveSections([{ section, patch }]);
  };

  return { status, save };
}

export function SaveFeedback({ status }: { status: SaveStatus }) {
  return (
    <span role="status" className="text-meta">
      {status === "saved" ? <span className="animate-fade text-strong">Saved</span> : null}
      {status === "error" ? <span className="text-reach">Couldn&apos;t save — try again.</span> : null}
    </span>
  );
}
