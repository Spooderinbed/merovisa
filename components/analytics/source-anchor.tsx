"use client";

import type { ReactNode } from "react";
import { track, type SourceSurface } from "@/lib/analytics/events";

const domainOf = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0] ?? url;

/**
 * Outbound source link with trust telemetry: same anchor semantics the panels
 * already use (new tab, noreferrer), plus a source_link_clicked event carrying
 * only the surface id and the destination domain.
 */
export function SourceAnchor({
  surface,
  href,
  className,
  title,
  children,
}: {
  surface: SourceSurface;
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={className}
      onClick={() => track("source_link_clicked", { surface, domain: domainOf(href) })}
    >
      {children}
    </a>
  );
}
