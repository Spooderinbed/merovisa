"use client";

import { useEffect, useState } from "react";
import type { StudentProfile } from "@/lib/scoring/types";
import type { AssessmentPayload } from "@/lib/results/types";
import { Wizard } from "@/components/wizard/wizard";
import { WIZARD_STORAGE_KEY } from "@/components/wizard/use-wizard-state";
import { ProfileRecap } from "./profile-recap";
import { Results } from "@/components/results/results";
import { formatExpiryLabel } from "@/lib/assessments/expiry";
import { corridorForHomeCountry } from "@/lib/theme/corridor";
import { track } from "@/lib/analytics/events";

type Phase = "wizard" | "recap" | "results";

// Computed results payload (+ profile + id) so a refresh / tab-restore on the
// results screen rehydrates the results view instead of dropping to the wizard
// (MV-28 a). Anonymous-only — signed-in users already persist server-side.
const RESULTS_STORAGE_KEY = "myvisa.results.v1";

interface PersistedResults {
  profile: StudentProfile;
  payload: AssessmentPayload;
  assessmentId: string | null;
  // Stored expiry instant (created + 3d) so a refresh keeps the real expiry day
  // instead of dropping it or re-deriving from the clock (MV-118 #4).
  expiresAt?: string | null;
}

function readPersistedResults(): PersistedResults | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RESULTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedResults;
    if (!parsed || !parsed.profile || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersisted(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RESULTS_STORAGE_KEY);
    window.sessionStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // Private mode / quota — nothing to clear.
  }
}

export function AssessFlow({
  signedIn = false,
  fresh = false,
}: { signedIn?: boolean; fresh?: boolean } = {}) {
  // SSR-stable seeds: never read sessionStorage during render, or the server
  // ("wizard") and the first client render (restored "results") would diverge and
  // React would report a whole-subtree hydration mismatch (MV-118 #3). Restoration
  // happens in the mount effect below instead.
  const [phase, setPhase] = useState<Phase>("wizard");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [payload, setPayload] = useState<AssessmentPayload | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [recapElapsed, setRecapElapsed] = useState(false);
  const [error, setError] = useState(false);
  // True while a save POST is in flight — lets the persist-miss recovery button on
  // the results screen show "Saving…" / disable so a retry can't be double-fired.
  const [retryingSave, setRetryingSave] = useState(false);

  // Restore persisted anonymous results after mount (never during render), so SSR
  // and the first client render both emit the wizard shell (MV-118 #3). A fresh
  // start (/assess?new=1) clears stale state instead of restoring; signed-in users
  // recover server-side, so client recovery is anonymous-only (MV-28 half a).
  useEffect(() => {
    if (signedIn) return;
    if (fresh) {
      clearPersisted();
      return;
    }
    const restored = readPersistedResults();
    if (!restored) return;
    setProfile(restored.profile);
    setPayload(restored.payload);
    setAssessmentId(restored.assessmentId);
    setExpiresAt(restored.expiresAt ?? null);
    setPhase("results");
  }, [signedIn, fresh]);

  useEffect(() => {
    if (phase !== "recap" || !payload || !recapElapsed) return;
    const id = setTimeout(() => setPhase("results"), 0);
    return () => clearTimeout(id);
  }, [phase, payload, recapElapsed]);

  // Persist the computed results once the flow reaches them (anonymous only),
  // so a refresh on the results screen restores the results view.
  useEffect(() => {
    if (signedIn || phase !== "results" || !payload || !profile) return;
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        RESULTS_STORAGE_KEY,
        JSON.stringify({ profile, payload, assessmentId, expiresAt } satisfies PersistedResults),
      );
    } catch {
      // Private mode / quota — degrade to in-memory only.
    }
  }, [signedIn, phase, payload, profile, assessmentId, expiresAt]);

  // Persists the profile to /api/assess. Kept separate from handleComplete so the
  // error screen can re-attempt the save in place (MV-31) without re-running the
  // wizard — the answers and computed state stay in memory.
  const save = async (completed: StudentProfile) => {
    setRecapElapsed(false);
    setError(false);
    setRetryingSave(true);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completed),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as {
        id: string | null;
        payload: AssessmentPayload;
        expiresAt?: string | null;
      };
      setAssessmentId(data.id);
      setPayload(data.payload);
      setExpiresAt(data.expiresAt ?? null);
    } catch {
      setError(true);
    } finally {
      setRetryingSave(false);
    }
  };

  const handleComplete = async (completed: StudentProfile) => {
    track("wizard_completed", { destination: completed.destination });
    setProfile(completed);
    setPhase("recap");
    await save(completed);
  };

  if (phase === "results" && payload && profile) {
    // Corridor activation point for the funnel (MV-96): the wizard just revealed
    // the home country, so results onward carry the corridor accent scope.
    // `contents` = token carrier only, no layout box.
    const corridor = corridorForHomeCountry(profile.homeCountry);
    return (
      <div className="contents" data-corridor={corridor ?? undefined}>
        <Results
          payload={payload}
          destination={profile.destination}
          mode={signedIn ? "owned" : "anonymous"}
          assessmentId={assessmentId}
          expiryLabel={expiresAt ? formatExpiryLabel(expiresAt) : undefined}
          // Persist-miss recovery is anonymous-only — signed-in users save server-side.
          // Re-POSTs the in-memory answers in place; the wizard is never re-run.
          onRetrySave={signedIn ? undefined : () => void save(profile)}
          retryingSave={retryingSave}
        />
      </div>
    );
  }

  if (phase === "recap" && profile) {
    if (error) {
      return (
        <div className="mx-auto grid min-h-[60vh] max-w-narrow place-items-center px-5 text-center">
          <div className="flex flex-col items-center gap-5">
            <p className="text-ink-soft">
              We couldn&apos;t save your assessment just now. Your answers are still here — try again.
            </p>
            <button
              type="button"
              onClick={() => void save(profile)}
              className="inline-flex rounded-pill bg-primary px-7 py-[15px] text-lead font-medium text-on-primary hover:bg-primary-ink"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return <ProfileRecap profile={profile} onDone={() => setRecapElapsed(true)} />;
  }

  return <Wizard onComplete={handleComplete} persist={!signedIn} fresh={fresh} />;
}
