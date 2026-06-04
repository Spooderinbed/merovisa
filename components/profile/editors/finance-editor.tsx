"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface FinanceInitial {
  total?: number;
  currency?: "NPR" | "USD" | "AUD" | "INR" | "BDT" | "PKR" | "NGN";
  source?: "self-funded" | "parents-family" | "education-loan" | "scholarship-dependent" | "mixed";
  proofUploaded?: boolean;
}

const CURRENCIES = [
  { value: "NPR", label: "NPR" },
  { value: "USD", label: "USD" },
  { value: "AUD", label: "AUD" },
  { value: "INR", label: "INR" },
  { value: "BDT", label: "BDT" },
  { value: "PKR", label: "PKR" },
  { value: "NGN", label: "NGN" },
];

const SOURCES = [
  { value: "self-funded", label: "Self-funded" },
  { value: "parents-family", label: "Parents/family" },
  { value: "education-loan", label: "Education loan" },
  { value: "scholarship-dependent", label: "Scholarship-dependent" },
  { value: "mixed", label: "Mixed sources" },
];

export function FinanceEditor({ initial }: { initial: FinanceInitial }) {
  const [total, setTotal] = useState<string>(initial.total?.toString() ?? "");
  const [currency, setCurrency] = useState<string>(initial.currency ?? "");
  const [source, setSource] = useState<string>(initial.source ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (total) patch.total = Number(total);
    if (currency) patch.currency = currency;
    if (source) patch.source = source;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "finance", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="fe-total" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Total funds available</label>
        <input id="fe-total" type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="fe-currency" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Currency</label>
        <select id="fe-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select a currency</option>
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="fe-source" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Source of funds</label>
        <select id="fe-source" value={source} onChange={(e) => setSource(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select a source</option>
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <p className="text-[13px] text-ink-soft">
        Have proof of funds? Upload your bank statement, loan sanction letter, or sponsor income on the{" "}
        <a href="/documents" className="text-primary underline-offset-2 hover:underline">
          Documents page
        </a>{" "}
        to mark this as complete.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
