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
  universities,
  documents,
  profilePct,
  scholarships,
}: {
  universities: number | null;
  documents: number | null;
  profilePct: number;
  scholarships: number | null;
}) {
  const dash = "—";
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Universities" value={universities ?? dash} href="/matches" />
      <Stat label="Documents" value={documents ?? dash} href="/checklist" />
      <Stat label="Profile" value={bandLabel(profilePct)} href="/profile" />
      <Stat label="Scholarships" value={scholarships ?? dash} href="/matches" />
    </section>
  );
}
