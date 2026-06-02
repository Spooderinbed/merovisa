/* ============================================================
   MyVisa — extended data (profile, scoring inputs, new outputs)
   Extends window.DB. Persona: Aarav Sharma, Nepal -> Australia.
   ============================================================ */
(function () {

  // ---------- comprehensive student profile ----------
  // null / [] === not yet provided (drives enrichment + missing-info)
  const profile = {
    personal:   { age: 23, citizenship: "Nepal", residence: "Nepal", intake: "July 2027" },
    destinations: { first: "au", second: "ca", third: null },
    academic:   { institution: "Tribhuvan University", field: "Computer Science",
                  gradYear: 2024, backlogs: 0, distinctions: false, research: false, publications: 0 },
    intended:   { level: "Master's", area: "Information Technology", specialization: "Artificial Intelligence" },
    english:    { status: "Taken", type: "IELTS", overall: 7.0, reportUploaded: false,
                  R: 7.0, W: 6.5, S: 7.0, L: 7.5 },
    gap:        { has: true, years: 1, reasons: ["Full-time employment"], evidence: [] },
    work:       { title: "Junior Developer", industry: "Software", employer: "Leapfrog Technology",
                  duration: "1 year", relevance: "Directly related", docs: false },
    finance:    { sponsor: "Education loan + parents", income: null, liquid: null, savings: null,
                  fixedDeposit: null, loan: "Applied", proofUploaded: false,
                  maxTuition: 34000, maxLiving: 14000, total: 38000, property: true },
    visaHistory:{ refusals: "None", travelled: false, countries: [], currentVisa: null },
    family:     { dependents: "Travelling alone", count: 0 },
    goals:      { primary: "Permanent residency", longTerm: "AI Engineer" },
    location:   { pref: "Major cities", cities: ["Melbourne", "Sydney"] },
    scholarshipProfile: [],     // none captured yet
    dealBreakers: ["PR-friendly destination", "Work opportunities"],
  };

  // ---------- profile sections (for the hub + completeness) ----------
  // status: 'done' | 'partial' | 'empty'
  const profileSections = [
    { key: "personal", title: "Personal information", icon: "user", status: "done",
      summary: "23 · Nepal · July 2027 intake",
      fields: [["Age", "23"], ["Citizenship", "Nepal"], ["Residence", "Nepal"], ["Intake", "July 2027"]] },
    { key: "destinations", title: "Destination preferences", icon: "map", status: "partial",
      summary: "Australia, then Canada",
      fields: [["First choice", "Australia"], ["Second choice", "Canada"], ["Third choice", "—"]] },
    { key: "academic", title: "Academic background", icon: "cap", status: "done",
      summary: "BSc CSIT · 72% · Tribhuvan University",
      fields: [["Qualification", "Bachelor's"], ["Institution", "Tribhuvan University"], ["Field", "Computer Science"],
               ["Result", "72% (first division)"], ["Graduated", "2024"], ["Backlogs", "0"]] },
    { key: "intended", title: "Intended study", icon: "spark", status: "done",
      summary: "Master's · IT · Artificial Intelligence",
      fields: [["Level", "Master's"], ["Area", "Information Technology"], ["Specialization", "Artificial Intelligence"]] },
    { key: "english", title: "English proficiency", icon: "doc", status: "partial",
      summary: "IELTS 7.0 — report not uploaded",
      fields: [["Status", "Taken"], ["Test", "IELTS"], ["Overall", "7.0"], ["R / W / S / L", "7.0 / 6.5 / 7.0 / 7.5"], ["Report uploaded", "No"]] },
    { key: "gap", title: "Study gap", icon: "clock", status: "partial",
      summary: "1 year · employment · evidence missing",
      fields: [["Gap", "1 year"], ["Reason", "Full-time employment"], ["Evidence", "Not uploaded"]] },
    { key: "work", title: "Work experience", icon: "briefcase", status: "partial",
      summary: "Junior Developer · 1 yr · docs missing",
      fields: [["Title", "Junior Developer"], ["Employer", "Leapfrog Technology"], ["Duration", "1 year"], ["Relevance", "Directly related"], ["Documents", "Not provided"]] },
    { key: "finance", title: "Financial capacity", icon: "coins", status: "partial",
      summary: "Loan + parents · proof not uploaded",
      fields: [["Sponsor", "Education loan + parents"], ["Loan status", "Applied"], ["Liquid funds", "Not stated"], ["Proof of funds", "Not uploaded"], ["Total budget", "$38,000 / yr"]] },
    { key: "visaHistory", title: "Immigration & visa history", icon: "shield", status: "partial",
      summary: "No refusals · travel history unknown",
      fields: [["Previous refusals", "None"], ["Travelled abroad", "Not stated"], ["Current visa", "—"]] },
    { key: "family", title: "Family information", icon: "user", status: "done",
      summary: "Travelling alone",
      fields: [["Dependents", "Travelling alone"], ["Number", "0"]] },
    { key: "goals", title: "Career goals", icon: "match", status: "done",
      summary: "PR · AI Engineer",
      fields: [["Primary goal", "Permanent residency"], ["Long-term", "AI Engineer"]] },
    { key: "scholarshipProfile", title: "Scholarship profile", icon: "award", status: "empty",
      summary: "Nothing added yet",
      fields: [["Academic excellence", "—"], ["Leadership", "—"], ["Volunteering", "—"], ["Achievements", "—"]] },
    { key: "dealBreakers", title: "Deal-breakers", icon: "pin", status: "done",
      summary: "PR-friendly · work rights",
      fields: [["Must have", "PR-friendly destination"], ["Must have", "Work opportunities"]] },
  ];

  // ---------- universities (matching) ----------
  // group is the curated result for THIS persona targeting Australia
  const universities = [
    { id: "u_monash", name: "Monash University", city: "Melbourne", flag: "🇦🇺", country: "au", rank: "#37 QS",
      program: "Master of IT (Professional)", tuition: "A$47,200 / yr", deadline: "30 Nov 2026",
      reqGrade: "Credit (65%+)", reqIELTS: "6.5", group: "strong",
      why: "Your 72% and IELTS 7.0 clear their thresholds comfortably; strong IT employability." },
    { id: "u_uts", name: "University of Technology Sydney", city: "Sydney", flag: "🇦🇺", country: "au", rank: "#88 QS",
      program: "Master of Information Technology", tuition: "A$46,800 / yr", deadline: "15 Dec 2026",
      reqGrade: "Credit (65%+)", reqIELTS: "6.5", group: "strong",
      why: "Industry-focused, above-threshold profile, well within reach." },
    { id: "u_rmit", name: "RMIT University", city: "Melbourne", flag: "🇦🇺", country: "au", rank: "#125 QS",
      program: "Master of IT", tuition: "A$43,200 / yr", deadline: "rolling",
      reqGrade: "Pass (60%+)", reqIELTS: "6.5", group: "strong",
      why: "Below your budget ceiling, rolling intake — a reliable anchor choice." },
    { id: "u_deakin", name: "Deakin University", city: "Melbourne", flag: "🇦🇺", country: "au", rank: "#197 QS",
      program: "Master of Information Technology", tuition: "A$42,400 / yr", deadline: "12 Jan 2027",
      reqGrade: "Pass (60%+)", reqIELTS: "6.0", group: "strong",
      why: "Generous scholarships for international students; comfortable fit." },
    { id: "u_melb", name: "University of Melbourne", city: "Melbourne", flag: "🇦🇺", country: "au", rank: "#13 QS",
      program: "Master of Information Technology", tuition: "A$49,344 / yr", deadline: "31 Oct 2026",
      reqGrade: "Distinction (74%+)", reqIELTS: "6.5", group: "possible",
      why: "IELTS clears it, but your WAM sits just under their usual cutoff — aspirational." },
    { id: "u_unsw", name: "UNSW Sydney", city: "Sydney", flag: "🇦🇺", country: "au", rank: "#19 QS",
      program: "Master of IT", tuition: "A$50,600 / yr", deadline: "30 Nov 2026",
      reqGrade: "Credit (72%+)", reqIELTS: "6.5", group: "possible",
      why: "Right at the edge of their academic band; tuition stretches your budget." },
    { id: "u_anu", name: "Australian National University", city: "Canberra", flag: "🇦🇺", country: "au", rank: "#30 QS",
      program: "Master of Computing", tuition: "A$51,300 / yr", deadline: "15 Dec 2026",
      reqGrade: "Distinction (74%+)", reqIELTS: "6.5", group: "reach",
      why: "Higher academic bar and cost than your current profile supports — a stretch." },
    { id: "u_syd", name: "University of Sydney", city: "Sydney", flag: "🇦🇺", country: "au", rank: "#18 QS",
      program: "Master of IT", tuition: "A$55,000 / yr", deadline: "31 Jan 2027",
      reqGrade: "Distinction (75%+)", reqIELTS: "7.0", group: "reach",
      why: "Top-tier cutoffs and the highest tuition here — keep as an ambition." },
  ];

  // ---------- scholarships ----------
  const scholarships = [
    { id: "s1", name: "Deakin Vice-Chancellor's International Scholarship", uni: "Deakin University", flag: "🇦🇺",
      amount: "Up to 50% tuition", basis: "Academic merit", match: "possible",
      note: "Your 72% is within range; strengthened by a clear SOP." },
    { id: "s2", name: "Monash International Merit Scholarship", uni: "Monash University", flag: "🇦🇺",
      amount: "A$10,000", basis: "Academic merit", match: "possible",
      note: "Awarded to high-performing international applicants — you're eligible to apply." },
    { id: "s3", name: "Melbourne Graduate Scholarship", uni: "University of Melbourne", flag: "🇦🇺",
      amount: "Up to 25% tuition", basis: "Academic merit", match: "reach",
      note: "Competitive — tied to a Distinction-level average." },
    { id: "s4", name: "Australia Awards Scholarship", uni: "Government of Australia", flag: "🇦🇺",
      amount: "Full tuition + living", basis: "Merit + leadership + development impact", match: "reach",
      note: "Highly competitive; needs strong leadership and community evidence — add these to your profile." },
  ];

  // ---------- cost estimation (Australia · Melbourne, Master of IT) ----------
  const costEstimate = {
    country: "au", basis: "Master of IT in Melbourne · per year, illustrative",
    fxNote: "A$1 ≈ US$0.66",
    items: [
      { label: "Tuition", icon: "cap", aud: 47200, note: "average of your strong matches" },
      { label: "Living costs", icon: "pin", aud: 29710, note: "government minimum for proof" },
      { label: "Student visa (subclass 500)", icon: "doc", aud: 1600, note: "one-time, 2026 fee" },
      { label: "Health cover (OSHC)", icon: "shield", aud: 2500, note: "per year, single" },
    ],
    oneTime: 1600,
  };

  // ---------- application timeline ----------
  const timeline = [
    { date: "Now – Jun 2026", title: "Shortlist & prep", status: "active",
      desc: "Lock a shortlist (1 reach, 2 strong), upload your IELTS report, gather transcripts." },
    { date: "Jul – Aug 2026", title: "Apply", status: "upcoming",
      desc: "Submit applications to Monash, UTS and one reach. Most have no application fee." },
    { date: "Sep – Oct 2026", title: "Offers & accept", status: "upcoming",
      desc: "Compare offers and scholarships, accept one, pay deposit to trigger your CoE." },
    { date: "Oct – Nov 2026", title: "Visa application", status: "upcoming",
      desc: "Lodge subclass 500 with proof of funds, OSHC and your Genuine Student statement." },
    { date: "Jan – Feb 2027", title: "Pre-departure", status: "upcoming",
      desc: "Visa grant, flights, accommodation, and arrival for the July 2027 intake." },
  ];

  // ---------- action plan (impact-ranked, each lifts a score) ----------
  // score: 'academic' | 'financial' | 'visa' | 'profile'
  const actionPlan = [
    { id: "a1", title: "Upload your IELTS report", impact: "high", score: "academic", effort: "5 min",
      desc: "You already scored 7.0 — uploading the report confirms it and unlocks 3 more matches.", done: false },
    { id: "a2", title: "Add proof of funds (A$29,710+)", impact: "high", score: "financial", effort: "this week",
      desc: "A bank statement or loan sanction letter is the single biggest lift to your visa case and financial score.", done: false },
    { id: "a3", title: "Get an employment reference letter", impact: "high", score: "visa", effort: "1–2 weeks",
      desc: "Turns your work gap from a question mark into documented, relevant experience.", done: false },
    { id: "a4", title: "Document your study-gap reasons", impact: "med", score: "visa", effort: "30 min",
      desc: "Draft the Genuine Student note explaining your year of work — your guide can help.", done: false },
    { id: "a5", title: "Add leadership & volunteering", impact: "med", score: "profile", effort: "15 min",
      desc: "Fills your scholarship profile and opens merit awards like Australia Awards.", done: false },
    { id: "a6", title: "Confirm liquid funds & savings", impact: "low", score: "financial", effort: "10 min",
      desc: "Sharpens your cost-vs-budget picture and scholarship eligibility.", done: false },
  ];

  const scoreMeta = {
    academic: { label: "Academic fit", icon: "cap" },
    financial: { label: "Financial readiness", icon: "coins" },
    visa: { label: "Visa case strength", icon: "shield" },
    profile: { label: "Profile strength", icon: "spark" },
  };

  Object.assign(window.DB, {
    profile, profileSections, universities, scholarships, costEstimate, timeline, actionPlan, scoreMeta,
    universitiesFor: (cid) => universities.filter(u => u.country === cid),
    uniById: (id) => universities.find(u => u.id === id),
  });
})();
