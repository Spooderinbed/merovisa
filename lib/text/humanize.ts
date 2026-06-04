const LABELS: Record<string, string> = {
  // Destinations
  "australia": "Australia",
  "canada": "Canada",
  "uk": "United Kingdom",
  "germany": "Germany",
  "usa": "United States",
  "ireland": "Ireland",
  "not-sure": "Not sure yet",
  // Education levels
  "higher-secondary": "+2 / Higher Secondary",
  "high-school": "High school",
  "bachelors": "Bachelor's",
  "masters": "Master's",
  "doctorate": "Doctorate",
  // Fields of study
  "computer-science": "Computer Science",
  "business": "Business",
  "nursing": "Nursing",
  "engineering": "Engineering",
  "hospitality": "Hospitality",
  "accounting": "Accounting",
  "data-science": "Data Science",
  "education": "Education",
  "agriculture": "Agriculture",
  "law": "Law",
  "arts": "Arts",
  "other": "Other",
  // Funding sources
  "self-funded": "Self-funded",
  "parents-family": "Parents / family",
  "education-loan": "Education loan",
  "mixed": "Mixed sources",
  "scholarship-dependent": "Scholarship-dependent",
  // Goals
  "permanent-residency": "Permanent residency",
  "lowest-cost": "Lowest cost",
  "highest-ranked": "Highest-ranked program",
  "fastest-admission": "Fastest admission",
  "best-employment": "Best employment outcome",
  "research": "Research career",
  // Gap reasons
  "worked": "Worked",
  "retook-exams": "Retook exams",
  "health-family": "Health / family",
  "started-something": "Started something",
  "preparing": "Preparing for studies",
  // Currencies (keep ISO codes)
  "NPR": "NPR", "USD": "USD", "AUD": "AUD",
  "INR": "INR", "BDT": "BDT", "PKR": "PKR", "NGN": "NGN",
  // English tests
  "ielts": "IELTS", "pte": "PTE", "toefl": "TOEFL",
  // English statuses
  "not-taken": "Not taken yet", "booked": "Booked", "taken": "Completed",
  // Grade systems
  "percentage-nepal": "Percentage (Nepal)",
  "cgpa-4": "CGPA / 4.0",
  "percentage-india": "Percentage (India)",
  "cgpa-10": "CGPA / 10",
  "cgpa-5": "CGPA / 5",
  "percentage": "Percentage",
  // Family situation
  "alone": "Going alone", "spouse": "With spouse",
  "spouse-and-kids": "With spouse and kids",
  // Work relevance
  "directly-related": "Directly related",
  "related": "Related",
  "unrelated": "Unrelated",
  // Immigration refusals
  "none": "None", "one": "One", "multiple": "Multiple",
};

/**
 * Human-readable label for an enum value. Falls back to a kebab-to-Title-Case
 * transform if the value isn't in the lookup. Pass-through for empty/null.
 */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const known = LABELS[value];
  if (known) return known;
  // Fallback: kebab/snake → Title Case
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
