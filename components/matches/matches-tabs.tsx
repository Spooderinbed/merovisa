"use client";

import { useState } from "react";

type Tab = "universities" | "scholarships" | "cost";

// Hoisted to module scope so its identity is stable across renders. Defined inside
// MatchesTabs (as a closure component) it was a fresh type every render, so React
// remounted all three buttons on each render / tab switch.
function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : "false"}
      className={`rounded-pill px-4 py-2 text-[14px] ${
        active ? "bg-primary text-on-primary" : "text-ink-soft hover:bg-bg-tint"
      }`}
    >
      {label}
    </button>
  );
}

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
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "universities"} label="Universities" onClick={() => setTab("universities")} />
        <TabButton active={tab === "scholarships"} label="Scholarships" onClick={() => setTab("scholarships")} />
        <TabButton active={tab === "cost"} label="Cost estimate" onClick={() => setTab("cost")} />
      </div>
      <div>{tab === "universities" ? universities : tab === "scholarships" ? scholarships : cost}</div>
    </div>
  );
}
