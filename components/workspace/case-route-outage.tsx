import Link from "next/link";
import { Card } from "@/components/ui/card";

/**
 * The case route's outage state, deliberately not `notFound()`: there is
 * something to retry, and telling a counsellor their student does not exist
 * because a read blipped is the quiet dishonesty this product exists to avoid.
 *
 * It carries its own back link because it renders when the persistent frame could
 * NOT be established — a reader who cannot see the case header still needs a way
 * out, and the way out is the Day view (spec §1, "Return behavior").
 */
export function CaseRouteOutage({
  organizationId,
  outage,
}: {
  organizationId: string;
  outage: "access" | "case";
}) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 py-10">
      <Link
        href={`/workspace/${organizationId}`}
        className="w-fit text-meta text-primary underline underline-offset-4"
      >
        ← Day view
      </Link>
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h1 className="text-title font-medium">
          {outage === "access"
            ? "We couldn't check your access"
            : "We couldn't load this student"}
        </h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about this student or your
          access — please try again in a moment.
        </p>
      </Card>
    </div>
  );
}
