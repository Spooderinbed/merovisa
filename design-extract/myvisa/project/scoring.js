/* ============================================================
   MyVisa — scoring engine (window.Engine)
   Rule-based for MVP. Inputs: wizard data + DB.profile enrichment.
   Outputs: 4 sub-scores (shown as bands, not raw numbers to users),
   overall verdict, visa-risk analysis, profile completeness.
   ============================================================ */
window.Engine = (function () {

  const clamp = (n, lo = 4, hi = 98) => Math.max(lo, Math.min(hi, Math.round(n)));
  const TYPICAL = { au: 60000, ca: 48000, uk: 42000, de: 16000, us: 70000, ie: 32000 };

  function bandOf(x) { return x >= 72 ? "strong" : x >= 50 ? "possible" : "reach"; }

  // merge live wizard answers over the stored profile
  function merged(data) {
    const p = (window.DB && DB.profile) || {};
    return { p, d: data || {} };
  }

  function gradePercent(d) {
    // wizard stores grade as a 0–100 proxy in every grade system
    return typeof d.grade === "number" ? d.grade : 70;
  }

  function computeScores(data) {
    const { p, d } = merged(data);
    const dest = d.destination || "au";

    // --- academic ---
    const grade = gradePercent(d);
    const ielts = p.english?.overall ?? d.ielts ?? 0;
    const englishNorm = ielts ? (ielts / 9) * 100 : 45;
    let academic = grade * 0.7 + englishNorm * 0.3
      - (p.academic?.backlogs || 0) * 3 + (p.academic?.distinctions ? 5 : 0);

    // --- financial ---
    const typical = TYPICAL[dest] || 45000;
    const budget = d.budget ?? p.finance?.total ?? 30000;
    const sponsor = (d.sponsor || p.finance?.sponsor || "").toLowerCase();
    let sponsorBonus = 0;
    if (sponsor.includes("loan")) sponsorBonus += 5;
    if (sponsor.includes("parent") || sponsor.includes("family")) sponsorBonus += 4;
    if (sponsor.includes("self")) sponsorBonus += 6;
    let financial = (budget / typical) * 78 + sponsorBonus + (p.finance?.proofUploaded ? 7 : -4);

    // --- visa case strength (higher = lower risk) ---
    let visa = 64;
    if (d.hasGap ?? p.gap?.has) {
      const reasons = d.gapReasons || p.gap?.reasons || [];
      visa += reasons.length ? 12 : -10;
      const evidence = p.gap?.evidence || [];
      visa += evidence.length ? 6 : -8;
    } else { visa += 8; }
    visa += (p.visaHistory?.refusals === "None") ? 12 : -14;
    visa += p.visaHistory?.travelled ? 6 : -2;
    visa += p.work?.docs ? 5 : -5;

    // --- profile strength ---
    let profile = 35;
    if (p.work?.title) profile += p.work.relevance === "Directly related" ? 18 : 10;
    if (p.academic?.research) profile += 10;
    if ((p.scholarshipProfile || []).length) profile += (p.scholarshipProfile.length) * 5;
    if (p.academic?.publications) profile += 8;

    const s = {
      academic: clamp(academic),
      financial: clamp(financial),
      visa: clamp(visa),
      profile: clamp(profile),
    };

    // --- overall verdict ---
    const overall = s.academic * 0.3 + s.financial * 0.25 + s.visa * 0.3 + s.profile * 0.15;
    let band = bandOf(overall);
    const curated = window.DB && DB.countryById(dest)?.match;
    if (curated === "strong" && band === "possible") band = "strong";
    if (curated === "reach" && band !== "reach") band = "possible";

    return {
      scores: s,
      bands: {
        academic: bandOf(s.academic), financial: bandOf(s.financial),
        visa: bandOf(s.visa), profile: bandOf(s.profile),
      },
      band, overall: Math.round(overall),
      country: window.DB ? DB.countryById(dest) : null,
    };
  }

  // --- visa-risk analysis: strengths / concerns / missing ---
  function visaAnalysis(data) {
    const { p, d } = merged(data);
    const strengths = [], concerns = [], missing = [];

    if ((p.visaHistory?.refusals || "None") === "None") strengths.push("No previous visa refusals on record");
    else concerns.push(`Previous refusal (${p.visaHistory.refusals}) must be addressed directly`);

    const hasGap = d.hasGap ?? p.gap?.has;
    if (hasGap) {
      const reasons = d.gapReasons || p.gap?.reasons || [];
      if (reasons.length) strengths.push(`Study gap is explainable — ${reasons.join(", ").toLowerCase()}`);
      else concerns.push("Study gap has no stated reason yet");
      if (!(p.gap?.evidence || []).length) missing.push("Evidence for your study gap (employment letter, etc.)");
    } else {
      strengths.push("No study gap to explain");
    }

    if (p.work?.title && !p.work?.docs) missing.push("Employment reference / experience letter");
    if (!p.finance?.proofUploaded) missing.push("Proof of funds document");
    if (!p.english?.reportUploaded) missing.push("Official English test report");
    if (p.visaHistory?.travelled === false || p.visaHistory?.travelled == null) concerns.push("No international travel history to show ties");

    const budget = d.budget ?? p.finance?.total ?? 0;
    const c = window.DB && DB.countryById(d.destination || "au");
    if (c && budget) {
      const typical = TYPICAL[c.id] || 45000;
      if (budget < typical * 0.7) concerns.push(`Budget is below the typical cost for ${c.name}`);
      else strengths.push("Budget is in a workable range for your destination");
    }

    return { strengths, concerns, missing };
  }

  // --- profile completeness ---
  function completeness() {
    const secs = (window.DB && DB.profileSections) || [];
    const w = { done: 1, partial: 0.5, empty: 0 };
    const sum = secs.reduce((a, s) => a + (w[s.status] ?? 0), 0);
    const pct = secs.length ? Math.round((sum / secs.length) * 100) : 0;
    const done = secs.filter(s => s.status === "done").length;
    const partial = secs.filter(s => s.status === "partial").length;
    const empty = secs.filter(s => s.status === "empty").length;
    return { pct, done, partial, empty, total: secs.length };
  }

  return { computeScores, visaAnalysis, completeness, bandOf };
})();
