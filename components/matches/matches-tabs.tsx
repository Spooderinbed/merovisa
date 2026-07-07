"use client";

import { useRef, useState } from "react";

type Tab = "universities" | "scholarships" | "cost";

const TABS: { key: Tab; label: string }[] = [
  { key: "universities", label: "Universities" },
  { key: "scholarships", label: "Scholarships" },
  { key: "cost", label: "Cost estimate" },
];

const tabId = (key: Tab) => `matches-tab-${key}`;
const panelId = (key: Tab) => `matches-panel-${key}`;

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
  // Stable per-tab button refs so keyboard navigation can move focus to the
  // newly-selected tab (roving tabindex + automatic activation).
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  function select(key: Tab) {
    setTab(key);
    tabRefs.current[key]?.focus();
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % TABS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = TABS[next];
    if (target) select(target.key);
  }

  const panelContent = tab === "universities" ? universities : tab === "scholarships" ? scholarships : cost;

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Match categories" className="flex flex-wrap gap-2">
        {TABS.map(({ key, label }, index) => {
          const active = tab === key;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-selected={active}
              aria-controls={panelId(key)}
              tabIndex={active ? 0 : -1}
              data-active={active ? "true" : "false"}
              onClick={() => select(key)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={`rounded-pill px-4 py-2 text-meta ${
                active ? "bg-primary text-on-primary font-medium" : "text-ink-soft hover:bg-bg-tint"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} tabIndex={0}>
        {panelContent}
      </div>
    </div>
  );
}
