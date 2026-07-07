import { cn } from "@/lib/utils";

/**
 * A bordered mono country-code pill — the neutral, flag-free way to mark a
 * destination. The imagery policy (docs/imagery-policy.md) bans flag iconography
 * on marketing surfaces, so a destination is named by its ISO 3166-1 alpha-2
 * code beside its country name. Decorative: the country NAME text always sits
 * next to it, so this is marked aria-hidden.
 */
export function IsoPill({ code, className }: { code: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-line bg-bg-tint px-1.5 py-0.5 font-mono text-caption font-medium uppercase tracking-wide text-ink-soft",
        className,
      )}
    >
      {code}
    </span>
  );
}
