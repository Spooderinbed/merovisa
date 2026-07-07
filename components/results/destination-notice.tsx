import Link from "next/link";
import type { Destination } from "@/lib/scoring/types";
import { Card } from "@/components/ui/card";
import { DESTINATION_LABELS } from "@/lib/labels";

/** Full-page honest stop: we don't cover this corridor — no Australia fallback. */
export function UnsupportedDestinationNotice({ destination }: { destination: Destination }) {
  const country = DESTINATION_LABELS[destination];
  return (
    <Card as="section" border="line-2" padding="lg">
      <p className="font-mono text-caption uppercase tracking-wide text-ink-faint">
        Destination coverage
      </p>
      <h1 className="mt-2 text-display leading-snug text-ink">
        We don&apos;t cover Nepal → {country} yet.
      </h1>
      <p className="mt-3 text-ink-soft">
        We only publish guidance we can verify against official sources, and {country} isn&apos;t
        there yet. Australia is the corridor we fully cover today.
      </p>
      <Link
        href="/assess?new=1"
        className="mt-5 inline-flex items-center rounded-pill bg-primary px-5 py-2.5 text-on-primary"
      >
        See where you stand for Australia →
      </Link>
    </Card>
  );
}

/** Framing line for "not sure yet" — we resolved the delegation to Australia, say so. */
export function NotSureFramingNotice() {
  return (
    <Card as="section" border="line-2" className="px-5 py-4">
      <p className="font-mono text-caption uppercase tracking-wide text-ink-faint">Destination</p>
      <p className="mt-1 text-ink-soft">
        You asked us to suggest a destination. Australia is the only corridor we fully cover
        today, so this readout shows where you stand for Nepal → Australia.
      </p>
    </Card>
  );
}
