"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

function expiryDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function ConversionPaths() {
  const [accountEmail, setAccountEmail] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [captured, setCaptured] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-4">
      {/* Tier 1 — full account */}
      <div className="rounded-lg border border-line bg-surface p-6">
        <h3 className="text-[21px]">Keep your assessment</h3>
        <p className="mt-2 text-[15px] text-ink-soft">
          Your assessment expires in 3 days (by {expiryDate()}). Create a free account to keep it and get updates
          as visa rules change.
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setCaptured(accountEmail);
          }}
        >
          <label className="flex flex-col gap-1 text-[15px] text-ink-soft">
            Email address
            <input
              type="email"
              required
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              className="rounded-sm border border-line-2 bg-surface px-3 py-2 text-ink outline-none focus:border-primary"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg">
              Create free account
            </Button>
            <Button type="button" variant="ghost" size="lg">
              Continue with Google
            </Button>
          </div>
        </form>
      </div>

      {/* Tier 2 — email only */}
      <form
        className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setCaptured(leadEmail);
        }}
      >
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
          <Button type="submit" variant="ghost">
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
