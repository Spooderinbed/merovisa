export const DOCUMENT_KINDS = [
  "passport", "birth-certificate", "national-id",
  "slc-see", "plus-two", "bachelors-transcript", "masters-transcript",
  "ielts", "pte", "toefl",
  "bank-statement", "loan-sanction", "sponsor-income",
  "employment-letter", "salary-slip",
  "offer-letter", "coe", "oshc", "medical", "other",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface DocumentKindMeta {
  kind: DocumentKind;
  label: string;
  group: "identity" | "academic" | "english" | "financial" | "employment" | "visa" | "other";
  profileSection: string | null;
  hasParser: boolean;
}

export const DOCUMENT_META: DocumentKindMeta[] = [
  { kind: "passport",            label: "Passport bio page",           group: "identity",   profileSection: "personal",       hasParser: true },
  { kind: "birth-certificate",   label: "Birth Certificate",           group: "identity",   profileSection: "personal",       hasParser: false },
  { kind: "national-id",         label: "Citizenship / National ID",   group: "identity",   profileSection: null,             hasParser: false },
  { kind: "slc-see",             label: "SLC/SEE Certificate (10th)",  group: "academic",   profileSection: "academic",       hasParser: false },
  { kind: "plus-two",            label: "+2 / Higher Secondary",       group: "academic",   profileSection: "academic",       hasParser: false },
  { kind: "bachelors-transcript", label: "Bachelor's Transcript",      group: "academic",   profileSection: "academic",       hasParser: true },
  { kind: "masters-transcript",  label: "Master's Transcript",        group: "academic",   profileSection: "academic",       hasParser: false },
  { kind: "ielts",               label: "IELTS Scorecard",             group: "english",    profileSection: "english",        hasParser: true },
  { kind: "pte",                 label: "PTE Academic Scorecard",      group: "english",    profileSection: "english",        hasParser: true },
  { kind: "toefl",               label: "TOEFL iBT Score Report",      group: "english",    profileSection: "english",        hasParser: true },
  { kind: "bank-statement",      label: "Bank Statement",              group: "financial",  profileSection: "finance",        hasParser: true },
  { kind: "loan-sanction",       label: "Education Loan Sanction Letter", group: "financial", profileSection: "finance",      hasParser: false },
  { kind: "sponsor-income",      label: "Sponsor Income Tax Return",   group: "financial",  profileSection: "finance",        hasParser: false },
  { kind: "employment-letter",   label: "Employment Letter",           group: "employment", profileSection: "work",           hasParser: true },
  { kind: "salary-slip",         label: "Salary Slip",                 group: "employment", profileSection: "work",           hasParser: true },
  { kind: "offer-letter",        label: "University Offer Letter",     group: "visa",       profileSection: "intended-study", hasParser: true },
  { kind: "coe",                 label: "Confirmation of Enrolment",   group: "visa",       profileSection: null,             hasParser: false },
  { kind: "oshc",                label: "Health Cover (OSHC) Policy",  group: "visa",       profileSection: null,             hasParser: false },
  { kind: "medical",             label: "Medical Exam Results",        group: "visa",       profileSection: null,             hasParser: false },
  { kind: "other",               label: "Other Document",              group: "other",      profileSection: null,             hasParser: false },
];

export const GROUP_LABELS: Record<DocumentKindMeta["group"], string> = {
  identity: "Identity",
  academic: "Academic",
  english: "English Proficiency",
  financial: "Financial",
  employment: "Employment",
  visa: "Visa",
  other: "Other",
};

export const GROUPS = ["identity", "academic", "english", "financial", "employment", "visa", "other"] as const;
