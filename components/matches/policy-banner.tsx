import {
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
          Nepal applications face heightened financial-evidence scrutiny &mdash; plan for 6 months of
          bank seasoning and a strong Genuine Student case.
        </li>
        <li>
          DHA financial floor: <strong className="text-ink">AUD {DHA_LIVING_COSTS_AUD.toLocaleString()}</strong>{" "}
          per year (effective {DHA_LIVING_COSTS_AUD_EFFECTIVE}).
        </li>
        <li>
          Nepal student-visa grant rate (DHA, Apr&ndash;Jun 2025):{" "}
          <strong className="text-ink">{NEPAL_AU_VISA_GRANT_RATE_BAND[0]}%</strong> applying from
          outside Australia, <strong className="text-ink">{NEPAL_AU_VISA_GRANT_RATE_BAND[1]}%</strong>{" "}
          from within.
        </li>
      </ul>
    </aside>
  );
}
