export function TrustStrip() {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex h-[38px] w-full max-w-[1120px] items-center justify-center gap-2 px-5">
        <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
        <span className="font-mono text-small text-ink-soft">
          No agents · no hidden commissions · we never steer you toward whoever pays us
        </span>
      </div>
    </div>
  );
}
