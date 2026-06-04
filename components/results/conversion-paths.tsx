"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ASSESSMENT_TTL_DAYS } from "@/lib/assessments/expiry";

function expiryDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + ASSESSMENT_TTL_DAYS * 24 * 60 * 60 * 1000);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function ConversionPaths({ assessmentId }: { assessmentId: string | null }) {
  const [leadEmail, setLeadEmail] = useState("");
  const [captured, setCaptured] = useState<string | null>(null);

  const continueWithGoogle = async () => {
    if (!assessmentId) return;
    // Fetch a signed claim token before redirecting to OAuth.
    let claimToken: string | null = null;
    try {
      const res = await fetch("/api/results/sign-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { token?: string };
        claimToken = data.token ?? null;
      }
    } catch {
      // If signing fails, proceed without claim — user can claim later.
    }
    const supabase = createSupabaseBrowserClient();
    const params = claimToken ? `?claim=${encodeURIComponent(claimToken)}` : "";
    const redirectTo = `${window.location.origin}/auth/callback${params}`;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  };

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentId) return;
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: leadEmail, assessmentId }),
    });
    setCaptured(leadEmail);
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Tier 1 — Google account */}
      <div className="rounded-lg border border-line bg-surface p-6">
        <h3 className="text-[21px]">Keep your assessment</h3>
        <p className="mt-2 text-[15px] text-ink-soft">
          Your assessment expires in 3 days (by {expiryDate()}). Create a free account with Google to keep it and
          get updates as visa rules change.
        </p>
        <div className="mt-4">
          <Button size="lg" onClick={continueWithGoogle} disabled={!assessmentId}>
            Continue with Google
          </Button>
        </div>
      </div>

      {/* Tier 2 — email lead only */}
      <form className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4" onSubmit={submitLead}>
        <label htmlFor="lead-email" className="text-[15px] text-ink-soft">
          Want to discuss with family first? Email me my results
        </label>
        <div className="flex flex-wrap gap-3">
          <input
            id="lead-email"
            type="email"
            required
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            className="min-w-[220px] flex-1 rounded-sm border border-line-2 bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
          />
          <Button type="submit" variant="ghost" disabled={!assessmentId}>
            Email me my results
          </Button>
        </div>
        {captured ? (
          <p className="text-[15px] text-strong">We&apos;ll send your results to {captured}.</p>
        ) : null}
      </form>

      {/* Tier 3 — come back later */}
      <p className="text-center font-mono text-[12.5px] text-ink-faint">
        Or come back later — your assessment is available for 3 days.
      </p>
    </section>
  );
}
