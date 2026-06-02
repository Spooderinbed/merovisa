import type { ReactNode } from "react";
import type { StudentProfile } from "@/lib/scoring/types";

export interface StepProps {
  profile: Partial<StudentProfile>;
  setField: (patch: Partial<StudentProfile>) => void;
  callouts: ReactNode;
}
