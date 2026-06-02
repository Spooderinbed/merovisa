export type CalloutStep =
  | "homeCountry"
  | "education"
  | "fieldOfStudy"
  | "graduationYear"
  | "english"
  | "destination"
  | "budget"
  | "goal";

export type CalloutTone = "info" | "warn" | "positive";

export interface Callout {
  id: string;
  step: CalloutStep;
  tone: CalloutTone;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}
