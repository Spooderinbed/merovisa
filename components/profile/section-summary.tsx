export function SectionSummary({ parts }: { parts: string[] }) {
  const text = parts.filter(Boolean).join(" · ");
  return <span className="text-[14px] text-ink-soft">{text || "Not added yet"}</span>;
}
