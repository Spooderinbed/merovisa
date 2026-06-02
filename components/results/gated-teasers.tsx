const TEASERS = [
  {
    title: "3 scholarships you may qualify for",
    peek: "Australia Awards Scholarship — full tuition + monthly stipend for eligible applicants",
  },
  {
    title: "23-step Australia procedure guide from Nepal",
    peek: "1. Collect academic transcripts  2. Sit IELTS at British Council  3. Shortlist universities",
  },
  {
    title: "14 documents in your checklist",
    peek: "Academic · Financial · Identity · English proficiency · Statement of purpose",
  },
];

export function GatedTeasers({ onUnlock }: { onUnlock: () => void }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[21px]">Unlock your full roadmap</h3>
      {TEASERS.map((t) => (
        <button
          key={t.title}
          type="button"
          onClick={onUnlock}
          className="overflow-hidden rounded-md border border-line bg-surface p-4 text-left"
        >
          <span className="block text-ink">{t.title}</span>
          <span className="mt-1 block text-[15px] text-ink-soft blur-[4px] select-none" aria-hidden>
            {t.peek}
          </span>
        </button>
      ))}
    </section>
  );
}
