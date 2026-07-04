"use client";

import { FIELDS_OF_STUDY_DATA } from "@/lib/data/fields-of-study";
import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import {
  reconcileAlsoConsidering,
  toggleAlsoConsidering,
  ALSO_CONSIDERING_CAP,
} from "@/lib/wizard/also-considering";
import { competitivenessNote } from "@/lib/scoring/field-note";
import type { StepProps } from "./types";

export function FieldOfStudyStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const primary = profile.fieldOfStudy;
  const also = profile.alsoConsidering ?? [];
  const atCap = also.length >= ALSO_CONSIDERING_CAP;
  const note = primary ? competitivenessNote(primary, also) : null;

  const choosePrimary = (id: typeof FIELDS_OF_STUDY_DATA[number]["id"]) =>
    // Re-picking a field that was in the extras keeps the two lists disjoint.
    setField({ fieldOfStudy: id, alsoConsidering: reconcileAlsoConsidering(id, also) });

  const toggleExtra = (id: typeof FIELDS_OF_STUDY_DATA[number]["id"]) =>
    setField({ alsoConsidering: toggleAlsoConsidering(also, id, primary) });

  return (
    <StepShell
      eyebrow={eyebrow}
      title="What do you want to study?"
      subtext="This affects which universities, fee ranges, and visa categories apply to you."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Field of study" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS_OF_STUDY_DATA.map((f) => (
          <OptionCard
            key={f.id}
            label={f.label}
            selected={primary === f.id}
            onSelect={() => choosePrimary(f.id)}
          />
        ))}
      </div>

      {primary ? (
        <div className="mt-8 flex animate-rise flex-col gap-3 border-t border-line pt-6">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
              Also considering? (optional — up to {ALSO_CONSIDERING_CAP})
            </span>
            <p className="text-[15px] text-ink-soft">
              Your verdict is based on your main choice. Extra picks just widen the university list we
              show you.
            </p>
          </div>
          <div
            role="group"
            aria-label="Other fields you're also considering"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {FIELDS_OF_STUDY_DATA.filter((f) => f.id !== primary).map((f) => {
              const selected = also.includes(f.id);
              return (
                <OptionCard
                  key={f.id}
                  label={f.label}
                  multi
                  selected={selected}
                  disabled={!selected && atCap}
                  onSelect={() => toggleExtra(f.id)}
                />
              );
            })}
          </div>
          {note ? (
            <p className="rounded-md border border-line bg-bg-tint px-3 py-2 text-[14px] text-ink-soft">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                Good to know
              </span>
              <br />
              {note.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </StepShell>
  );
}
