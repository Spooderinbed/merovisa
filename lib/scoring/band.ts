export type Band = "strong" | "solid" | "building" | "weak";

export function bandFor(value: number): Band {
  if (value >= 75) return "strong";
  if (value >= 50) return "solid";
  if (value >= 25) return "building";
  return "weak";
}

export function bandLabel(value: number): string {
  switch (bandFor(value)) {
    case "strong":   return "Strong";
    case "solid":    return "Solid";
    case "building": return "Building";
    case "weak":     return "Needs work";
  }
}
