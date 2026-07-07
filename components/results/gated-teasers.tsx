import { Card } from "@/components/ui/card";
import { track } from "@/lib/analytics/events";

// Tease only deliverables that actually exist. Scholarship matching isn't built, so it
// is never promised here — and neither is any "we'll email you" follow-up, because there
// is no email path in the product. We name real outputs (the per-program document
// checklist and the action plan) and describe them qualitatively, with no invented counts.
const TEASERS = [
  {
    title: "Your personalised document checklist",
    peek: "The documents each matched program asks for — academic, financial, identity, English and statement of purpose — with the Nepal-specific steps to obtain them.",
  },
  {
    title: "Your action plan",
    peek: "A prioritised list of what to do next to strengthen your matches, ordered by the lift each step gives you.",
  },
];

export function GatedTeasers({ onUnlock, unlocked = false }: { onUnlock: () => void; unlocked?: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-headline">Your full roadmap</h3>
      {unlocked ? (
        TEASERS.map((t) => (
          <Card key={t.title} radius="card" padding="sm">
            <span className="block text-ink">{t.title}</span>
            <span className="mt-1 block text-body text-ink-soft">{t.peek}</span>
          </Card>
        ))
      ) : (
        TEASERS.map((t) => (
          <Card
            as="button"
            key={t.title}
            type="button"
            onClick={() => {
              track("gate_cta_clicked");
              onUnlock();
            }}
            radius="card"
            padding="sm"
            className="overflow-hidden text-left"
          >
            <span className="block text-ink">{t.title}</span>
            <span className="mt-1 block text-body text-ink-soft blur-[4px] select-none" aria-hidden>
              {t.peek}
            </span>
          </Card>
        ))
      )}
    </section>
  );
}
