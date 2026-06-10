"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SectionKey } from "@/lib/profiles/sections";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVED_VISIBLE_MS = 2000;

/**
 * Shared save lifecycle for profile section editors: PATCHes the section,
 * refreshes server-rendered data (row summary + completeness ring) on success,
 * and clears the saved notice after a short delay.
 */
export function useSectionSave(section: SectionKey) {
  const router = useRouter();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const save = async (patch: Record<string, unknown>) => {
    clearTimeout(timer.current);
    setStatus("saving");
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, patch }),
    }).catch(() => null);
    if (res?.ok) {
      setStatus("saved");
      router.refresh();
      timer.current = setTimeout(() => setStatus("idle"), SAVED_VISIBLE_MS);
    } else {
      setStatus("error");
    }
  };

  return { status, save };
}

export function SaveFeedback({ status }: { status: SaveStatus }) {
  return (
    <span role="status" className="text-[14px]">
      {status === "saved" ? <span className="animate-fade text-strong">Saved</span> : null}
      {status === "error" ? <span className="text-reach">Couldn&apos;t save — try again.</span> : null}
    </span>
  );
}
