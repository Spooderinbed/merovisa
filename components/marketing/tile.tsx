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
    <article className="flex min-h-[200px] flex-col gap-3 rounded-lg border border-line bg-surface p-6">
      <div className="flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-primary-tint text-primary">
          {iconSvg}
        </span>
        {badge ? (
          <span className="inline-flex items-center rounded-pill bg-bg-tint px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-1 text-[21px]">{title}</h3>
      <p className="text-[15px] text-ink-soft">{body}</p>
    </article>
  );
}
