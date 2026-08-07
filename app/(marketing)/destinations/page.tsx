import { Eyebrow } from "@/components/marketing/eyebrow";
import { DestinationCard } from "@/components/destinations/destination-card";
import { MARKETING_DESTINATIONS } from "@/lib/marketing/destinations";

export default function DestinationsPage() {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-10">
      <Eyebrow>Destinations</Eyebrow>
      {/* 860px, not the old 700px: the second line measures 834px at the 52px clamp max, so a
          700px cap silently wrapped it and rendered this two-line headline as three ragged ones. */}
      <h1 className="mt-3 max-w-[860px] text-[clamp(34px,4.4vw,52px)] leading-[1.05]">
        <span className="block">Six countries researched.</span>
        <span className="block">One corridor we assess end-to-end.</span>
      </h1>
      <p className="mt-4 max-w-[60ch] text-lead text-ink-soft">
        Visa rules, real costs, and what you&apos;ll need. Every page shows where the data came from and when we last
        checked — but today we only assess your standing for Nepal → Australia.
      </p>
      <div className="mt-8 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MARKETING_DESTINATIONS.map((d) => (
          <DestinationCard key={d.id} destination={d} />
        ))}
      </div>
    </section>
  );
}
