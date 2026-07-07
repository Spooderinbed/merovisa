import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type scale (docs/design/2026-07-03-type-scale-adr.md, MV-106) names
// font-size utilities as bare words — `text-body`, `text-caption`, … Stock
// tailwind-merge can't distinguish those from `text-<colour>` utilities
// (`text-ink`, `text-reach`), so it would treat `text-body` and `text-reach` as
// the same group and silently drop the size when both meet in one cn() call
// (e.g. VerdictPill's `text-caption` beside `text-reach`). Register the scale in
// the font-size group so size and colour coexist, and two sizes still dedupe
// (later wins) — including an arbitrary `text-[13px]` override at a call site.
const TYPE_SCALE = [
  "caption",
  "small",
  "meta",
  "body",
  "control",
  "lead",
  "title",
  "headline",
  "display",
];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: TYPE_SCALE }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNpr(amount: number): string {
  if (amount >= 10000000) {
    const crore = amount / 10000000;
    const display = crore % 1 === 0 ? crore.toFixed(0) : crore.toFixed(1);
    return `NPR ${display} crore`;
  }
  const lakh = Math.round(amount / 100000);
  return `NPR ${lakh} lakh`;
}

export function formatUsd(amount: number): string {
  if (amount >= 1000) {
    const k = Math.round(amount / 1000);
    return `USD ${k}k`;
  }
  return `USD ${amount}`;
}

export function formatAud(amount: number): string {
  if (amount >= 1000) {
    const k = Math.round(amount / 1000);
    return `A$${k}k`;
  }
  return `A$${amount}`;
}

export function yearsBetween(pastYear: number, reference?: number): number {
  const ref = reference ?? new Date().getFullYear();
  return Math.max(0, ref - pastYear);
}
