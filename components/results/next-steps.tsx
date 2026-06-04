import Link from "next/link";

const LINKS = [
  {
    href: "/dashboard",
    title: "Open dashboard",
    description: "See your assessment summary, plan progress, and next actions at a glance.",
  },
  {
    href: "/profile",
    title: "Complete your profile",
    description: "Add more details to improve your match accuracy and unlock personalised guidance.",
  },
  {
    href: "/matches",
    title: "Browse programs",
    description: "Explore matched universities and shortlist the ones that fit you best.",
  },
];

export function NextSteps() {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[21px]">What&apos;s next</h3>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="group flex flex-col gap-1 rounded-lg border border-line bg-surface p-5 transition-colors duration-150 ease-calm hover:border-primary"
        >
          <span className="text-[17px] text-ink group-hover:text-primary">{l.title}</span>
          <span className="text-[15px] text-ink-soft">{l.description}</span>
        </Link>
      ))}
    </section>
  );
}
