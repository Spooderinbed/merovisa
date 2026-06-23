"use client";

import { useEffect, useState } from "react";
import type { StudentProfile } from "@/lib/scoring/types";
import type { AssessmentPayload } from "@/lib/results/types";
import { Wizard } from "@/components/wizard/wizard";
import { ProfileRecap } from "./profile-recap";
import { Results } from "@/components/results/results";
import { track } from "@/lib/analytics/events";

type Phase = "wizard" | "recap" | "results";

export function AssessFlow({ signedIn = false }: { signedIn?: boolean } = {}) {
  const [phase, setPhase] = useState<Phase>("wizard");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [payload, setPayload] = useState<AssessmentPayload | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [recapElapsed, setRecapElapsed] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (phase !== "recap" || !payload || !recapElapsed) return;
    const id = setTimeout(() => setPhase("results"), 0);
    return () => clearTimeout(id);
  }, [phase, payload, recapElapsed]);

  // Persists the profile to /api/assess. Kept separate from handleComplete so the
  // error screen can re-attempt the save in place (MV-31) without re-running the
  // wizard — the answers and computed state stay in memory.
  const save = async (completed: StudentProfile) => {
    setRecapElapsed(false);
    setError(false);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completed),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as { id: string | null; payload: AssessmentPayload };
      setAssessmentId(data.id);
      setPayload(data.payload);
    } catch {
      setError(true);
    }
  };

  const handleComplete = async (completed: StudentProfile) => {
    track("wizard_completed", { destination: completed.destination });
    setProfile(completed);
    setPhase("recap");
    await save(completed);
  };

  if (phase === "results" && payload && profile) {
    return (
      <Results
        payload={payload}
        destination={profile.destination}
        mode={signedIn ? "owned" : "anonymous"}
        assessmentId={assessmentId}
      />
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
              className="inline-flex rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return <ProfileRecap profile={profile} onDone={() => setRecapElapsed(true)} />;
  }

  return <Wizard onComplete={handleComplete} />;
}
