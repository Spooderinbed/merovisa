import type { ReactNode } from "react";
import type { StudentProfile } from "@/lib/scoring/types";

export interface StepProps {
  profile: Partial<StudentProfile>;
  setField: (patch: Partial<StudentProfile>) => void;
  callouts: ReactNode;
  /** The step's eyebrow, derived from its visible position (e.g. "Step 6"). */
  eyebrow: string;
}
