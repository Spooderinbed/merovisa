"use client";

import { useState } from "react";

/**
 * Small shared chip input: type then Enter/comma (or blur) adds a chip,
 * clicking a chip removes it. Controlled — writes the string[] up via onChange.
 */
export function ChipInput({
  id, value, onChange, placeholder,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    const chip = draft.trim();
    if (chip && !value.includes(chip)) onChange([...value, chip]);
    setDraft("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line-2 bg-surface px-3 py-2 focus-within:border-primary">
      {value.map((chip) => (
        <button
          key={chip}
          type="button"
          aria-label={`Remove ${chip}`}
          onClick={() => onChange(value.filter((c) => c !== chip))}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line-2 bg-bg-tint px-2.5 py-0.5 text-[13px] text-ink transition-colors duration-150 ease-calm hover:border-line"
        >
          {chip}
          <span aria-hidden className="text-ink-faint">×</span>
        </button>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commitDraft}
        placeholder={placeholder}
        className="min-w-[120px] flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}
