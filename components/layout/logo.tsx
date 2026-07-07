import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 transition-opacity duration-fast ease-calm hover:opacity-80">
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-md bg-primary text-on-primary"
      >
        {/* graduation cap */}
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10 12 5 2 10l10 5 10-5Z" />
          <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
        </svg>
      </span>
      <span className="text-title font-medium tracking-[-0.02em] text-ink">MyVisa</span>
    </Link>
  );
}
