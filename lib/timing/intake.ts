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
