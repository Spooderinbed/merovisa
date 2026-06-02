import type { ReactNode } from "react";

export interface StepShellProps {
  eyebrow: string;
  title: string;
  subtext: string;
  children: ReactNode;
  callouts?: ReactNode;
}

export function StepShell({ eyebrow, title, subtext, children, callouts }: StepShellProps) {
  return (
    <div className="animate-rise flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{eyebrow}</span>
        <h1 className="text-[clamp(24px,3vw,34px)]">{title}</h1>
        <p className="text-[17px] text-ink-soft">{subtext}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
      {callouts}
    </div>
  );
}
