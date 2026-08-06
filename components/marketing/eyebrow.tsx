import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-caption uppercase tracking-wide text-primary", className)}>
      {children}
    </span>
  );
}
