import { Card } from "@/components/ui/card";

export function Tile({
  title,
  body,
  iconSvg,
  badge,
}: {
  title: string;
  body: string;
  iconSvg: React.ReactNode;
  badge?: string;
}) {
  return (
    <Card as="article" padding="lg" className="flex min-h-[200px] flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-primary-tint text-primary">
          {iconSvg}
        </span>
        {badge ? (
          <span className="inline-flex items-center rounded-pill bg-bg-tint px-2.5 py-0.5 font-mono text-caption text-ink-soft">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-1 text-headline">{title}</h3>
      <p className="text-body text-ink-soft">{body}</p>
    </Card>
  );
}
