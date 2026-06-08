/**
 * AU visa-preparation plan kinds, in the order to tackle them (Genuine Student leads).
 * Rendered as the "Visa preparation" section, separate from the impact-grouped
 * "Your next steps". A future slice that adds an AU visa-prep action MUST add its kind
 * here so it lands in this section. Render-time grouping — no DB column, no migration.
 */
export const VISA_PREP_KINDS = [
  "prepare-gs-answers",
  "apply-for-noc",
  "translate-certify-documents",
  "prepare-health-exam",
  "prepare-biometrics",
  "prepare-police-certificate",
] as const;

const ORDER = new Map<string, number>(VISA_PREP_KINDS.map((k, i) => [k, i]));
export const isVisaPrep = (kind: string): boolean => ORDER.has(kind);
export const visaPrepOrder = (kind: string): number => ORDER.get(kind) ?? Number.MAX_SAFE_INTEGER;
