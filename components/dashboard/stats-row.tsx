import { bandLabel } from "@/lib/scoring/band";

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-5">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="text-[24px] font-medium text-ink">{value}</span>
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export function StatsRow({
  savedPrograms,
  documents,
  profilePct,
}: {
  savedPrograms: number | null;
  documents: number | null;
  profilePct: number;
}) {
  const dash = "—";
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* Counts shortlisted PROGRAMS (one row per program_id), not distinct universities —
          so it's labelled "Saved programs". A bare 0 then reads "none saved yet", never
          "0 universities exist". */}
      <Stat label="Saved programs" value={savedPrograms ?? dash} href="/matches" />
      <Stat label="Documents" value={documents ?? dash} href="/documents" />
      <Stat label="Profile" value={bandLabel(profilePct)} href="/profile" />
      {/* Scholarship matching isn't built yet — an honest non-link tile, not a doorway to a stub. */}
      <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-5">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Scholarships</span>
        <span className="text-[15px] text-ink-faint">Coming soon</span>
      </div>
    </section>
  );
}
