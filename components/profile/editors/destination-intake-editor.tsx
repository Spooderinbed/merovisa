"use client";

import { useRef, useState } from "react";
import { DESTINATIONS, isDestinationSupported, type Destination } from "@/lib/scoring/types";
import { humanize } from "@/lib/text/humanize";
import { normalizeStoredDestination } from "@/components/profile/groups";
import { Button } from "@/components/ui/button";
import { OptionCard } from "@/components/ui/option-card";
import { ChipInput } from "./chip-input";
import { SaveFeedback, useGroupSave, type GroupSaveEntry } from "./section-save";

export interface DestinationIntakeInitial {
  destination?: { primary?: string; alternates?: string[] };
  personal?: { intakeIso?: string };
  "deal-breakers"?: { mustHaves?: string[] };
}

/** Same honesty rule as the wizard: supported corridors + "not-sure" only. */
function isSelectable(value: Destination): boolean {
  return isDestinationSupported(value) || value === "not-sure";
}

function destinationPatch(primary: string, alternates: readonly string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (primary) patch.primary = primary;
  if (alternates.length) patch.alternates = alternates;
  return patch;
}

function personalPatch(intake: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (intake) patch.intakeIso = intake;
  return patch;
}

function dealBreakersPatch(mustHaves: readonly string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (mustHaves.length) patch.mustHaves = mustHaves;
  return patch;
}

/**
 * "Destination & intake" group: destination + the intake date (stored on
 * personal.intakeIso — its PATCH targets personal) + deal-breakers.
 * Unsupported countries render disabled with the wizard's "Coming soon"
 * treatment; saves always write scoring ids ("us" loads as "usa").
 */
export function DestinationIntakeEditor({ initial }: { initial: DestinationIntakeInitial }) {
  const [primary, setPrimary] = useState<string>(
    initial.destination?.primary ? normalizeStoredDestination(initial.destination.primary) : "",
  );
  const [alternates, setAlternates] = useState<Destination[]>([
    ...new Set((initial.destination?.alternates ?? []).map(normalizeStoredDestination)),
  ]);
  const [intake, setIntake] = useState<string>(initial.personal?.intakeIso ?? "");
  const [mustHaves, setMustHaves] = useState<string[]>(initial["deal-breakers"]?.mustHaves ?? []);
  const { status, saveSections } = useGroupSave();

  // Baselines come from the RAW stored values, so a legacy "us" row counts as
  // dirty against the normalized state and self-heals to "usa" on next save.
  const baseline = useRef({
    destination: JSON.stringify(
      destinationPatch(initial.destination?.primary ?? "", initial.destination?.alternates ?? []),
    ),
    personal: JSON.stringify(personalPatch(initial.personal?.intakeIso ?? "")),
    dealBreakers: JSON.stringify(dealBreakersPatch(initial["deal-breakers"]?.mustHaves ?? [])),
  });

  const toggleAlternate = (value: Destination) => {
    setAlternates((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  // "Not sure" belongs to the primary choice; keep a stored not-sure alternate visible.
  const alternateOptions = DESTINATIONS.filter((d) => d !== "not-sure" || alternates.includes(d));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const destination = destinationPatch(primary, alternates);
    const personal = personalPatch(intake);
    const dealBreakers = dealBreakersPatch(mustHaves);
    const entries: GroupSaveEntry[] = [];
    if (JSON.stringify(destination) !== baseline.current.destination) entries.push({ section: "destination", patch: destination });
    if (JSON.stringify(personal) !== baseline.current.personal) entries.push({ section: "personal", patch: personal });
    if (JSON.stringify(dealBreakers) !== baseline.current.dealBreakers) entries.push({ section: "deal-breakers", patch: dealBreakers });
    if (await saveSections(entries)) {
      baseline.current = {
        destination: JSON.stringify(destination),
        personal: JSON.stringify(personal),
        dealBreakers: JSON.stringify(dealBreakers),
      };
    }
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Primary destination</span>
        <div role="radiogroup" aria-label="Primary destination" className="flex flex-col gap-2">
          {DESTINATIONS.map((d) => {
            const selectable = isSelectable(d);
            return (
              <OptionCard
                key={d}
                label={humanize(d)}
                selected={primary === d}
                onSelect={() => setPrimary(d)}
                disabled={!selectable}
                description={selectable ? undefined : "Coming soon"}
              />
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Alternate destinations</span>
        <div role="group" aria-label="Alternate destinations" className="flex flex-col gap-2">
          {alternateOptions.map((d) => {
            const selectable = isSelectable(d);
            const selected = alternates.includes(d);
            return (
              <OptionCard
                key={d}
                label={humanize(d)}
                multi
                selected={selected}
                onSelect={() => toggleAlternate(d)}
                // Honesty restricts adding, not removing: a stored unsupported
                // alternate stays interactive so the user can untick it.
                disabled={!selectable && !selected}
                description={selectable ? undefined : "Coming soon"}
              />
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <label htmlFor="pe-intake" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Intake</label>
        <input id="pe-intake" type="date" value={intake} onChange={(e) => setIntake(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary" />
        <span className="text-[12px] text-ink-soft">When you plan to start studying.</span>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <label htmlFor="dbe-musthaves" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Must-haves</label>
        <ChipInput id="dbe-musthaves" value={mustHaves} onChange={setMustHaves}
          placeholder="e.g. PR pathway, work rights" />
        <span className="text-[12px] text-ink-soft">Deal-breakers a destination must meet. Press Enter to add each one.</span>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
