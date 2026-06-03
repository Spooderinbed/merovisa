export type Step = "shortlist" | "apply" | "visa" | "pre-departure" | "arrival";

const STEPS: Array<[Step, string]> = [
  ["shortlist", "Shortlist & prep"],
  ["apply", "Apply"],
  ["visa", "Visa"],
  ["pre-departure", "Pre-departure"],
  ["arrival", "Arrival"],
];

export function JourneyTimeline({ currentStep }: { currentStep: Step }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Your journey</span>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {STEPS.map(([key, label]) => (
          <li
            key={key}
            data-testid={`step-${key}`}
            data-active={key === currentStep ? "true" : "false"}
            className={`flex flex-col items-start gap-2 rounded-md border border-line p-3 ${key === currentStep ? "bg-primary-tint" : ""}`}
          >
            <span className={`inline-block h-2 w-2 rounded-pill ${key === currentStep ? "bg-primary" : "bg-line-2"}`} />
            <span className="text-[14px] font-medium text-ink">{label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
