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
}

export const DOCUMENT_META: DocumentKindMeta[] = [
  { kind: "passport",            label: "Passport bio page",              group: "identity",   profileSection: "personal"       },
  { kind: "birth-certificate",   label: "Birth Certificate",              group: "identity",   profileSection: "personal"       },
  { kind: "national-id",         label: "Citizenship / National ID",      group: "identity",   profileSection: null             },
  { kind: "slc-see",             label: "SLC/SEE Certificate (10th)",     group: "academic",   profileSection: "academic"       },
  { kind: "plus-two",            label: "+2 / Higher Secondary",          group: "academic",   profileSection: "academic"       },
  { kind: "bachelors-transcript", label: "Bachelor's Transcript",         group: "academic",   profileSection: "academic"       },
  { kind: "masters-transcript",  label: "Master's Transcript",            group: "academic",   profileSection: "academic"       },
  { kind: "ielts",               label: "IELTS Scorecard",                group: "english",    profileSection: "english"        },
  { kind: "pte",                 label: "PTE Academic Scorecard",         group: "english",    profileSection: "english"        },
  { kind: "toefl",               label: "TOEFL iBT Score Report",         group: "english",    profileSection: "english"        },
  { kind: "bank-statement",      label: "Bank Statement",                 group: "financial",  profileSection: "finance"        },
  { kind: "loan-sanction",       label: "Education Loan Sanction Letter", group: "financial",  profileSection: "finance"        },
  { kind: "sponsor-income",      label: "Sponsor Income Tax Return",      group: "financial",  profileSection: "finance"        },
  { kind: "employment-letter",   label: "Employment Letter",              group: "employment", profileSection: "work"           },
  { kind: "salary-slip",         label: "Salary Slip",                    group: "employment", profileSection: "work"           },
  { kind: "offer-letter",        label: "University Offer Letter",        group: "visa",       profileSection: "intended-study" },
  { kind: "coe",                 label: "Confirmation of Enrolment",      group: "visa",       profileSection: null             },
  { kind: "oshc",                label: "Health Cover (OSHC) Policy",     group: "visa",       profileSection: null             },
  { kind: "medical",             label: "Medical Exam Results",           group: "visa",       profileSection: null             },
  { kind: "other",               label: "Other Document",                 group: "other",      profileSection: null             },
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
