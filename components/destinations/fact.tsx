import { Card } from "@/components/ui/card";

export function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card radius="card" padding="sm" className="flex flex-col gap-2">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-primary">{label}</span>
      <span className={mono ? "font-mono text-[13px] text-ink" : "text-[16px] font-medium text-ink"}>{value}</span>
    </Card>
  );
}
