export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-wide text-primary">
      {children}
    </span>
  );
}
