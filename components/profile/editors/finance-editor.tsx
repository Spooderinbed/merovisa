"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useSectionSave } from "./section-save";
import { BankLoanPanel } from "./bank-loan-panel";
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";

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

const EVIDENCE_PATH_LABELS = AU_FINANCIAL_EVIDENCE.filter((e) => e.kind === "evidence-path").map((e) =>
  e.label.toLowerCase(),
);
const DHA_PATHS_SOURCE = AU_FINANCIAL_EVIDENCE.find((e) => e.kind === "evidence-path")!.source;
const DHA_PATHS_SENTENCE = `${EVIDENCE_PATH_LABELS.slice(0, -1).join(", ")}, or ${EVIDENCE_PATH_LABELS[EVIDENCE_PATH_LABELS.length - 1]!}`;

export function FinanceEditor({ initial }: { initial: FinanceInitial }) {
  const [total, setTotal] = useState<string>(initial.total?.toString() ?? "");
  const [currency, setCurrency] = useState<string>(initial.currency ?? "");
  const [source, setSource] = useState<string>(initial.source ?? "");
  const { status, save } = useSectionSave("finance");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (total) patch.total = Number(total);
    if (currency) patch.currency = currency;
    if (source) patch.source = source;
    await save(patch);
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
      {source === "education-loan" ? <BankLoanPanel /> : null}
      <p className="text-[13px] text-ink-soft">
        Have proof of funds? Upload your bank statement, loan sanction letter, or sponsor income on the{" "}
        <a href="/documents" className="text-primary underline-offset-2 hover:underline">
          Documents page
        </a>{" "}
        to mark this as complete. DHA accepts {DHA_PATHS_SENTENCE} as proof of funds — see the{" "}
        <a
          href={DHA_PATHS_SOURCE}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          DHA student visa page
        </a>
        .
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
