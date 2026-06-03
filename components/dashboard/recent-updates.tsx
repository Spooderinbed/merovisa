export interface UpdateItem {
  id: string;
  title: string;
  body: string;
  iso: string;
}

export function RecentUpdates({ updates }: { updates: UpdateItem[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Recent updates</span>
      {updates.length === 0 ? (
        <p className="text-[15px] text-ink-soft">No updates yet. We&apos;ll notify you here when visa rules or matches change.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {updates.map((u) => (
            <li key={u.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
              <span className="text-[15px] font-medium text-ink">{u.title}</span>
              <span className="text-[14px] text-ink-soft">{u.body}</span>
              <span className="font-mono text-[12px] text-ink-faint">{u.iso}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
