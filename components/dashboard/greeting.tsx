export type PartOfDay = "morning" | "afternoon" | "evening";

export function Greeting({ name, partOfDay }: { name: string | null; partOfDay: PartOfDay }) {
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";
  return (
    <header className="animate-rise flex flex-col gap-1">
      <span className="text-caption uppercase tracking-wide text-ink-faint">Welcome back</span>
      <h1 className="text-[clamp(28px,3.6vw,40px)] leading-[1.05]">Good {partOfDay}, {first}.</h1>
    </header>
  );
}
