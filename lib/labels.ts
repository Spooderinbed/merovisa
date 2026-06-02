import type {
  EducationLevel,
  FieldOfStudy,
  Destination,
  FundingSource,
  Goal,
  GapReason,
} from "@/lib/scoring/types";

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  "higher-secondary": "Higher secondary (+2)",
  bachelors: "Bachelor's",
  masters: "Master's",
};

export const FIELD_LABELS: Record<FieldOfStudy, string> = {
  "computer-science": "Computer Science",
  business: "Business",
  nursing: "Nursing",
  engineering: "Engineering",
  hospitality: "Hospitality",
  accounting: "Accounting",
  "data-science": "Data Science",
  education: "Education",
  agriculture: "Agriculture",
  law: "Law",
  arts: "Arts",
  other: "Other",
};

export const DESTINATION_LABELS: Record<Destination, string> = {
  australia: "Australia",
  canada: "Canada",
  uk: "UK",
  germany: "Germany",
  usa: "USA",
  ireland: "Ireland",
  "not-sure": "Not sure yet",
};

export const FUNDING_LABELS: Record<FundingSource, string> = {
  "self-funded": "Self-funded",
  "parents-family": "Parents / family",
  "education-loan": "Education loan",
  mixed: "Mixed",
  "scholarship-dependent": "Scholarship-dependent",
};

export const GOAL_LABELS: Record<Goal, string> = {
  "permanent-residency": "Permanent residency",
  "lowest-cost": "Lowest total cost",
  "highest-ranked": "Highest-ranked university",
  "fastest-admission": "Fastest admission",
  "best-employment": "Best employment outcomes",
  research: "Research opportunities",
};

export const GAP_REASON_LABELS: Record<GapReason, string> = {
  worked: "Worked",
  "retook-exams": "Retook exams",
  "health-family": "Health or family",
  "started-something": "Started something",
  preparing: "Preparing for tests",
};
