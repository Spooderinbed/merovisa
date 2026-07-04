import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/utils";

type Radius = "card" | "panel";
type Tone = "surface" | "tint" | "primary";
type Border = "line" | "line-2" | "transparent";
type Padding = "sm" | "md" | "lg";

// Role-to-radius mapping (audit #12): inputs 8px, cards 12px, panels 16px.
// In this app's @theme scale rounded-md = 12px and rounded-lg = 16px.
const radii: Record<Radius, string> = {
  card: "rounded-md",
  panel: "rounded-lg",
};

const tones: Record<Tone, string> = {
  surface: "bg-surface",
  tint: "bg-bg-tint",
  primary: "bg-primary text-on-primary",
};

const borders: Record<Border, string> = {
  line: "border-line",
  "line-2": "border-line-2",
  transparent: "border-transparent",
};

const paddings: Record<Padding, string> = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

type CardOwnProps<T extends ElementType> = {
  as?: T;
  radius?: Radius;
  tone?: Tone;
  border?: Border;
  padding?: Padding;
  className?: string;
};

export type CardProps<T extends ElementType = "div"> = CardOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps<T>>;

export function Card<T extends ElementType = "div">({
  as,
  radius = "panel",
  tone = "surface",
  border = "line",
  padding,
  className,
  ...props
}: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(radii[radius], "border", borders[border], tones[tone], padding && paddings[padding], className)}
      {...props}
    />
  );
}
