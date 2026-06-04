import {
  NEPAL_ASSESSMENT_LEVEL,
  NEPAL_ASSESSMENT_LEVEL_EFFECTIVE,
  DHA_LIVING_COSTS_AUD,
  DHA_LIVING_COSTS_AUD_EFFECTIVE,
  NEPAL_AU_VISA_GRANT_RATE_BAND,
} from "@/lib/programs/policy";

export function PolicyBanner() {
  return (
    <aside className="flex flex-col gap-2 rounded-md border border-line bg-bg-tint p-4 text-[14px] text-ink-soft">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Current policy (Nepal &rarr; Australia)
      </span>
      <ul className="flex flex-col gap-1">
        <li>
          Assessment Level <strong className="text-ink">{NEPAL_ASSESSMENT_LEVEL}</strong> in effect since{" "}
          <span className="font-mono">{NEPAL_ASSESSMENT_LEVEL_EFFECTIVE}</span>. Expect 6-month bank seasoning + Genuine Student narrative.
        </li>
        <li>
          DHA financial floor: <strong className="text-ink">AUD {DHA_LIVING_COSTS_AUD.toLocaleString()}</strong>{" "}
          per year (effective {DHA_LIVING_COSTS_AUD_EFFECTIVE}).
        </li>
        <li>
          Nepal grant rate band (practitioner estimate):{" "}
          <strong className="text-ink">
            {NEPAL_AU_VISA_GRANT_RATE_BAND[0]}&ndash;{NEPAL_AU_VISA_GRANT_RATE_BAND[1]}%
          </strong>.
        </li>
      </ul>
    </aside>
  );
}
