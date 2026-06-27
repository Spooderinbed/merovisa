import type { StudentProfile } from "@/lib/scoring/types";
import type { DestinationCountryData } from "@/lib/data/types";

export type IntakeStatus = "open" | "tight" | "closed";

export interface IntakeOption {
  name: string;
  year: number;
  month: number;
  status: IntakeStatus;
  note: string;
}

export interface IntakeTiming {
  nearest: IntakeOption;
  alternatives: IntakeOption[];
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function formatDate(date: Date): string {
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

export function computeIntakeTiming(
  profile: StudentProfile,
  destination: DestinationCountryData,
  now: Date = new Date(),
): IntakeTiming {
  const englishReady = profile.englishStatus === "taken";
  const options: IntakeOption[] = [];

  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    for (const intake of destination.intakes) {
      const year = now.getFullYear() + yearOffset;
      const intakeDate = new Date(year, intake.month - 1, 1);
      if (intakeDate.getTime() <= now.getTime()) continue;

      const deadline = new Date(intakeDate.getTime() - intake.deadlineWeeksBefore * MS_PER_WEEK);
      const weeksToDeadline = (deadline.getTime() - now.getTime()) / MS_PER_WEEK;

      let status: IntakeStatus;
      let note: string;
      if (weeksToDeadline < 0) {
        status = "closed";
        note = "Application window has closed for this cycle.";
      } else if (weeksToDeadline < 8 || (!englishReady && weeksToDeadline < 16)) {
        status = "tight";
        note = englishReady
          ? `Tight — applications due by ${formatDate(deadline)}.`
          : `Tight — IELTS and financials needed by ${formatDate(deadline)}.`;
      } else {
        status = "open";
        note = `On track — apply by ${formatDate(deadline)}.`;
      }

      options.push({ name: intake.name, year, month: intake.month, status, note });
    }
  }

  options.sort((a, b) => a.year - b.year || a.month - b.month);

  const nearest = options.find((o) => o.status !== "closed") ?? options[0]!;
  const alternatives = options.filter((o) => o !== nearest);
  return { nearest, alternatives };
}

/** An intake placed on the timeline track: `offsetPct` is its distance from `now` (0) to the furthest intake (100). */
export interface IntakeTimelinePoint extends IntakeOption {
  offsetPct: number;
}

/**
 * Lay every intake (nearest + alternatives) on a single chronological track for the
 * tick-timeline: `now` anchors the start (0%) and the furthest intake the end (100%),
 * so the gap before each tick reflects real calendar distance. Pure geometry — no
 * dates are invented; positions derive only from each option's month/year.
 */
export function buildIntakeTimeline(
  timing: IntakeTiming,
  now: Date = new Date(),
): IntakeTimelinePoint[] {
  const options = [timing.nearest, ...timing.alternatives]
    .slice()
    .sort((a, b) => a.year - b.year || a.month - b.month);

  const msFromNow = (o: IntakeOption) =>
    new Date(o.year, o.month - 1, 1).getTime() - now.getTime();
  const furthest = options.reduce((max, o) => Math.max(max, msFromNow(o)), 0);

  return options.map((o) => {
    const raw = furthest > 0 ? (msFromNow(o) / furthest) * 100 : 0;
    return { ...o, offsetPct: Math.min(100, Math.max(0, raw)) };
  });
}
