export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-caption uppercase tracking-wide text-primary">
      {children}
    </span>
  );
}
