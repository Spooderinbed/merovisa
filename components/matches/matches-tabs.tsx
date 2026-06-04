"use client";

import { useState } from "react";

type Tab = "universities" | "scholarships" | "cost";

export function MatchesTabs({
  universities,
  scholarships,
  cost,
}: {
  universities: React.ReactNode;
  scholarships: React.ReactNode;
  cost: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("universities");
  const Btn = ({ id, label }: { id: Tab; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      data-active={tab === id ? "true" : "false"}
      className={`rounded-pill px-4 py-2 text-[14px] ${
        tab === id ? "bg-primary text-on-primary" : "text-ink-soft hover:bg-bg-tint"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Btn id="universities" label="Universities" />
        <Btn id="scholarships" label="Scholarships" />
        <Btn id="cost" label="Cost estimate" />
      </div>
      <div>
        {tab === "universities" ? universities : tab === "scholarships" ? scholarships : cost}
      </div>
    </div>
  );
}
