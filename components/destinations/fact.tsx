import { Card } from "@/components/ui/card";

export function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card radius="card" padding="sm" className="flex flex-col gap-2">
      <span className="text-caption uppercase tracking-wide text-primary">{label}</span>
      <span className={mono ? "font-mono text-small text-ink" : "text-control font-medium text-ink"}>{value}</span>
    </Card>
  );
}
