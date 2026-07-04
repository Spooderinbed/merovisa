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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span
          className="animate-rise font-mono text-[11.5px] uppercase tracking-wide text-ink-faint"
          style={{ animationDelay: "0s" }}
        >
          {eyebrow}
        </span>
        <h1 className="animate-rise text-[clamp(24px,3vw,34px)]" style={{ animationDelay: "0.05s" }}>
          {title}
        </h1>
        <p className="animate-rise text-[17px] text-ink-soft" style={{ animationDelay: "0.1s" }}>
          {subtext}
        </p>
      </div>
      <div className="animate-rise flex flex-col gap-3" style={{ animationDelay: "0.15s" }}>
        {children}
      </div>
      {callouts}
    </div>
  );
}
