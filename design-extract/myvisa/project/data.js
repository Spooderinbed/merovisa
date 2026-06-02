/* ============================================================
   MyVisa — seed data (window.DB)
   Persona: Nepal -> Australia. Six destinations with current visa data.
   All figures illustrative for the prototype.
   ============================================================ */
window.DB = (function () {

  const student = {
    name: "Aarav Sharma",
    initials: "AS",
    homeCountry: "Nepal",
    homeFlag: "🇳🇵",
    level: "Bachelor's degree",
    field: "Computer science",
    gradeSystem: "Percentage (Nepal)",   // TU percentage
    grade: 72,                            // first division
    gradeLabel: "72% — first division",
    tests: { ielts: 7.0 },
    gap: { has: true, years: 1, reason: "Worked as a junior developer" },
    budgetUSD: 38000,                     // tuition + living per year
    destination: "Australia",
  };

  // grade conversion lookup — editable table, not hardcoded math (per spec)
  const gradeConversion = {
    note: "Maps home grade systems to a comparable destination value. Curated per destination, editable.",
    "Australia": { "Percentage (Nepal)": { 72: "Credit (≈ 65–74%) · WAM ~68" } },
  };

  // ---------- destinations ----------
  const countries = [
    {
      id: "au", name: "Australia", flag: "🇦🇺",
      tagline: "Strong post-study work rights, clear financial rules.",
      currency: "AUD",
      tuitionRange: "A$33k–48k / yr",
      livingRange: "A$29,710 / yr (proof required)",
      financialProof: "A$29,710 for living + first-year tuition + travel",
      workRights: "48 hrs / fortnight during term, unlimited in breaks",
      postStudy: "Temporary Graduate visa (485): 2–4 yrs",
      risk: {
        level: "caution",
        title: "Genuine Student (GS) requirement replaced GTE",
        body: "Since 2024 the Genuine Student requirement and higher savings thresholds apply. A clearly explained study gap strengthens your case.",
      },
      updated: "2026-05-28",
      source: "immi.gov.au",
      docs: ["Valid passport", "Offer letter (CoE)", "Genuine Student statement", "Proof of funds (A$29,710+)", "IELTS/PTE results", "OSHC health cover", "Academic transcripts"],
      match: "strong",
    },
    {
      id: "ca", name: "Canada", flag: "🇨🇦",
      tagline: "Provincial caps in effect — apply early.",
      currency: "CAD",
      tuitionRange: "C$25k–38k / yr",
      livingRange: "C$20,635 / yr (proof required)",
      financialProof: "C$20,635 living + tuition (outside Quebec)",
      workRights: "Up to 24 hrs / week off-campus during term",
      postStudy: "PGWP: up to 3 yrs (field-of-study rules apply)",
      risk: {
        level: "warning",
        title: "Study permit cap + PAL/TAL letter required",
        body: "A federal cap on new permits is in place for 2025–26 and most applicants need a Provincial Attestation Letter. Approval is tighter than before.",
      },
      updated: "2026-05-30",
      source: "canada.ca/ircc",
      docs: ["Valid passport", "Letter of acceptance", "Provincial Attestation Letter (PAL)", "Proof of funds (C$20,635+)", "Language test", "Statement of purpose", "Academic transcripts"],
      match: "possible",
    },
    {
      id: "uk", name: "United Kingdom", flag: "🇬🇧",
      tagline: "Fast visa decisions; dependant rules tightened.",
      currency: "GBP",
      tuitionRange: "£16k–32k / yr",
      livingRange: "£12,006 / yr (outside London)",
      financialProof: "£12,006–£13,348 living + tuition for 1 yr",
      workRights: "20 hrs / week during term",
      postStudy: "Graduate Route: 18 months (under review)",
      risk: {
        level: "warning",
        title: "Graduate Route under review; dependants restricted",
        body: "Most taught-master's students can no longer bring dependants, and the post-study Graduate Route length is under government review for 2026.",
      },
      updated: "2026-05-26",
      source: "gov.uk",
      docs: ["Valid passport", "CAS from university", "Proof of funds (28-day rule)", "IELTS for UKVI", "TB test certificate", "Academic transcripts", "ATAS (if applicable)"],
      match: "possible",
    },
    {
      id: "de", name: "Germany", flag: "🇩🇪",
      tagline: "Low/no tuition at public universities.",
      currency: "EUR",
      tuitionRange: "€0–3k / yr (public)",
      livingRange: "€11,904 / yr (blocked account)",
      financialProof: "€11,904 in a blocked account",
      workRights: "140 full / 280 half days per year",
      postStudy: "18-month residence permit to seek work",
      risk: {
        level: "info",
        title: "Blocked-account minimum raised for 2026",
        body: "The required blocked-account amount rose to €11,904. APS certificate is mandatory for applicants from Nepal and India.",
      },
      updated: "2026-05-22",
      source: "auswaertiges-amt.de",
      docs: ["Valid passport", "Admission letter (Zulassung)", "APS certificate", "Blocked account (€11,904)", "Proof of German/English level", "Health insurance", "Academic transcripts"],
      match: "reach",
    },
    {
      id: "us", name: "United States", flag: "🇺🇸",
      tagline: "Largest choice; interview-based visa.",
      currency: "USD",
      tuitionRange: "$28k–60k / yr",
      livingRange: "$18k–26k / yr",
      financialProof: "Full first-year cost on Form I-20",
      workRights: "On-campus only in year 1; CPT/OPT later",
      postStudy: "OPT 12 mos (+24 mos STEM extension)",
      risk: {
        level: "warning",
        title: "Visa interview wait times remain long",
        body: "F-1 interview slots are limited in several posts and officers weigh ties to home country heavily. A funded, specific study plan helps.",
      },
      updated: "2026-05-29",
      source: "travel.state.gov",
      docs: ["Valid passport", "Form I-20", "SEVIS fee receipt", "DS-160 confirmation", "Proof of funds (full I-20 cost)", "Visa interview appointment", "Academic transcripts"],
      match: "reach",
    },
    {
      id: "ie", name: "Ireland", flag: "🇮🇪",
      tagline: "English-speaking EU; growing tech sector.",
      currency: "EUR",
      tuitionRange: "€10k–25k / yr",
      livingRange: "€10,000 / yr (proof required)",
      financialProof: "€10,000 for living + tuition paid",
      workRights: "20 hrs / week during term",
      postStudy: "Third Level Graduate Programme: up to 2 yrs",
      risk: {
        level: "info",
        title: "Proof-of-funds threshold confirmed at €10,000",
        body: "Ireland confirmed the €10,000 annual maintenance figure and continues to process most student visas within 4–8 weeks.",
      },
      updated: "2026-05-20",
      source: "irishimmigration.ie",
      docs: ["Valid passport", "Letter of acceptance", "Tuition payment proof", "Proof of funds (€10,000)", "English test (if required)", "Private medical insurance", "Academic transcripts"],
      match: "possible",
    },
  ];

  // ---------- matched programs (for the feed) ----------
  const programs = [
    { id: "p1", uni: "University of Melbourne", country: "au", flag: "🇦🇺",
      program: "Master of Information Technology", city: "Melbourne",
      tuition: "A$49,344 / yr", deadline: "31 Oct 2026", match: "possible",
      note: "Your IELTS clears the 6.5 band; WAM is just under their usual cutoff." },
    { id: "p2", uni: "Monash University", country: "au", flag: "🇦🇺",
      program: "Master of IT (Professional)", city: "Melbourne",
      tuition: "A$47,200 / yr", deadline: "30 Nov 2026", match: "strong",
      note: "Profile sits comfortably above admission thresholds." },
    { id: "p3", uni: "University of Technology Sydney", country: "au", flag: "🇦🇺",
      program: "Master of Information Technology", city: "Sydney",
      tuition: "A$46,800 / yr", deadline: "15 Dec 2026", match: "strong",
      note: "Strong academic + budget fit; gap is well explained." },
    { id: "p4", uni: "RMIT University", country: "au", flag: "🇦🇺",
      program: "Master of IT", city: "Melbourne",
      tuition: "A$43,200 / yr", deadline: "ongoing", match: "strong",
      note: "Below your budget ceiling, rolling intake." },
  ];

  // ---------- personalized feed ----------
  const feed = [
    { id: "f0", kind: "next-action", priority: true,
      title: "Your next best step",
      body: "Add your IELTS test report number to unlock 3 more matches and sharpen your Australia verdict.",
      cta: "Add test details", icon: "spark" },
    { id: "f1", kind: "visa-update", country: "au", flag: "🇦🇺",
      title: "Australia: Genuine Student rules — what it means for you",
      body: "Your 1-year work gap is an asset here, not a liability, if you explain it clearly. I've drafted a note you can reuse.",
      meta: "Visa update · sourced from immi.gov.au", updated: "2 days ago", icon: "shield" },
    { id: "f2", kind: "match", programId: "p2",
      title: "New strong match: Monash University",
      body: "Master of IT (Professional) — your profile is above their thresholds and A$47k fits your budget.",
      meta: "Program match", updated: "today", icon: "match" },
    { id: "f3", kind: "deadline", country: "au", flag: "🇦🇺",
      title: "Deadline in 21 weeks: University of Melbourne",
      body: "Master of Information Technology closes 31 Oct 2026. You have 3 of 7 checklist items ready.",
      meta: "Deadline", updated: "tracked", icon: "clock" },
    { id: "f4", kind: "scholarship", country: "au", flag: "🇦🇺",
      title: "Scholarship you may qualify for",
      body: "Melbourne Graduate Scholarship covers up to 25% tuition for high-performing international students.",
      meta: "Scholarship · check eligibility", updated: "new", icon: "award" },
    { id: "f5", kind: "guide", 
      title: "A note from your guide",
      body: "You're in good shape for Australia. The single highest-impact thing right now is documenting your work gap — want to do that together?",
      meta: "From your guide", updated: "today", icon: "guide" },
  ];

  // ---------- document checklist (Australia / Melbourne) ----------
  const checklist = {
    target: "University of Melbourne · Master of IT",
    deadline: "31 Oct 2026",
    weeksLeft: 21,
    groups: [
      { name: "Identity", items: [
        { id: "c1", label: "Valid passport (6+ months)", done: true },
        { id: "c2", label: "Passport-style photo", done: true },
      ]},
      { name: "Academic", items: [
        { id: "c3", label: "Bachelor's transcripts (attested)", done: true },
        { id: "c4", label: "Degree certificate", done: false },
        { id: "c5", label: "IELTS / PTE result", done: false, note: "You have IELTS 7.0 — just upload the report" },
      ]},
      { name: "Financial", items: [
        { id: "c6", label: "Proof of funds — A$29,710+ living", done: false, note: "Bank statement or loan sanction letter" },
        { id: "c7", label: "First-year tuition evidence", done: false },
      ]},
      { name: "Visa & statements", items: [
        { id: "c8", label: "Confirmation of Enrolment (CoE)", done: false, note: "Issued after you accept an offer" },
        { id: "c9", label: "Genuine Student statement", done: false, note: "Where your work gap is explained" },
        { id: "c10", label: "OSHC health cover", done: false },
      ]},
    ],
  };

  // ---------- AI guide canned conversation ----------
  const guideIntro = "Hi Aarav — I'm your guide. I've read your profile: a bachelor's in CS from Nepal, 72%, IELTS 7.0, one year of work, looking at Australia on a ~$38k budget. Ask me anything, or tap a prompt below.";
  const guidePrompts = [
    "Is my study gap a problem for Australia?",
    "How much money do I need to show?",
    "Which of my matches is the safest bet?",
    "What should I do this week?",
  ];
  const guideReplies = {
    "Is my study gap a problem for Australia?":
      "Honestly — for Australia, a one-year gap is fine, and yours is easy to explain because you were working as a junior developer. What matters is that your Genuine Student statement connects the dots: what you did, what you learned, and why a master's in IT is the logical next step. I can help you draft that. The risk is leaving it vague, not the gap itself.",
    "How much money do I need to show?":
      "For Australia you currently need to show A$29,710 for living costs, plus your first year of tuition and travel. For Melbourne's Master of IT (≈A$49,344/yr) that's roughly A$80k of evidenced funds. This can be savings, an education loan sanction letter, or a sponsor's funds — sourced from immi.gov.au, checked 2 days ago. Want me to break down what counts as acceptable proof?",
    "Which of my matches is the safest bet?":
      "Right now your strongest, safest matches are Monash and UTS — both sit above their admission thresholds for your profile and fit your budget. Melbourne is a 'possible': your IELTS clears it, but your WAM is just under their typical cutoff, so treat it as an aspirational pick alongside a safer one. A good shortlist is one reach, two strong.",
    "What should I do this week?":
      "One thing: upload your IELTS report and bachelor's degree certificate. That unlocks three more matches and lets me sharpen your Australia verdict from 'strong' to a specific shortlist. Everything else — funds, CoE, the Genuine Student statement — comes after you've accepted an offer, so it's not urgent yet.",
  };

  return {
    student, gradeConversion, countries, programs, feed, checklist,
    guideIntro, guidePrompts, guideReplies,
    countryById: id => countries.find(c => c.id === id),
    programById: id => programs.find(p => p.id === id),
    trustLine: "Visa rules sourced from official government sites · checked daily",
  };
})();
