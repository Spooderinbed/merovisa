import { Card } from "@/components/ui/card";

const STEPS = [
  ["1", "Tell us about you", "Where you're from, your grades in your own grade system, your budget. One question at a time."],
  ["2", "See where you stand", "A banded verdict with the factors that drove it — academic fit, budget, and how your gap reads."],
  ["3", "Build your case", "Track applications, work the checklist, and let your guide keep your visa info fresh."],
] as const;

export function HowItWorks() {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3">
        {STEPS.map(([n, t, b], i) => (
          <div
            key={n}
            className={
              "p-7 " +
              (i < STEPS.length - 1 ? "border-b border-line md:border-b-0 md:border-r" : "")
            }
          >
            <span className="font-mono text-[22px] font-medium text-primary">{n}</span>
            <h3 className="mt-3 text-[20px]">{t}</h3>
            <p className="mt-2 text-[15px] text-ink-soft">{b}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
