import { describe, it, expect } from "vitest";
import { generateChecklist } from "@/lib/checklist/generator";
import type { ChecklistItem } from "@/lib/checklist/types";
import type { Program } from "@/lib/programs/types";
import type { DocumentKind } from "@/lib/documents/types";

const baseProgram: Program = {
  id: "p1", universityId: "u1", name: "Master of IT", level: "masters",
  field: "computer-science", tuitionMin: 40000, tuitionMax: 45000, tuitionCurrency: "AUD",
  minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
  source: "https://example.edu/it", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
};
const noKinds = new Set<DocumentKind>();
const keys = (items: ChecklistItem[]) => items.map((i) => i.key);
const byKey = (items: ChecklistItem[], k: string) => items.find((i) => i.key === k);

describe("generateChecklist", () => {
  it("always requires passport + national id (identity, now)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "passport")).toMatchObject({ kind: "passport", stage: "now", requirement: "required", group: "identity", status: "missing" });
    expect(byKey(items, "national-id")?.requirement).toBe("required");
  });

  it("requires bachelor's transcript for a masters program, not a master's transcript", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "bachelors-transcript")).toMatchObject({ requirement: "required", stage: "now" });
    expect(keys(items)).not.toContain("masters-transcript");
  });

  it("requires +2 and SLC for a bachelors program", () => {
    const items = generateChecklist({ program: { ...baseProgram, level: "bachelors" }, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "plus-two")?.requirement).toBe("required");
    expect(byKey(items, "slc-see")?.requirement).toBe("required");
    expect(keys(items)).not.toContain("bachelors-transcript");
  });

  it("marks an uploaded kind as have", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: new Set<DocumentKind>(["passport"]) });
    expect(byKey(items, "passport")?.status).toBe("have");
    expect(byKey(items, "national-id")?.status).toBe("missing");
  });

  it("states the program's English requirement and sources it", () => {
    const eng = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "english");
    expect(eng?.requirement).toBe("required");
    expect(eng?.note).toContain("IELTS 6.5");
    expect(eng?.note).toContain("each band ≥ 6");
    expect(eng?.source?.url).toBe("https://example.edu/it");
  });

  it("surfaces the visa English-evidence requirement (approved test or exemption) on the English item (I.025)", () => {
    const eng = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "english");
    expect(eng?.note).toContain(
      "Required for the visa. Provide evidence of an approved English test score, or evidence that you qualify for an exemption.",
    );
    // the admission threshold line is still present (not replaced)
    expect(eng?.note).toContain("IELTS 6.5");
  });

  it("defaults the English kind to the student's test when known", () => {
    const items = generateChecklist({ program: baseProgram, sections: { english: { test: "pte" } }, uploadedKinds: noKinds });
    expect(byKey(items, "english")?.kind).toBe("pte");
  });

  it("adds nursing deltas: band-7 note + AHPRA info item", () => {
    const items = generateChecklist({ program: { ...baseProgram, field: "nursing" }, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "english")?.note).toContain("each band ≥ 7");
    expect(byKey(items, "ahpra")).toMatchObject({ kind: null, status: "info", group: "academic" });
    // Read-through F6: no source backs a blanket "require" — pathway framing + confirm with the provider.
    expect(byKey(items, "ahpra")?.note).toBe(
      "Nursing pathways involve registration with the Australian Health Practitioner Regulation Agency (AHPRA) — confirm your program's requirements with the provider.",
    );
  });

  it("self-funded → bank statement required, no sponsor income", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(keys(items)).not.toContain("fin-sponsor");
  });

  it("parents-family → bank statement + sponsor income required", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "parents-family" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(byKey(items, "fin-sponsor")?.requirement).toBe("required");
  });

  it("education-loan → loan sanction required, bank recommended", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "education-loan" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-loan")?.requirement).toBe("required");
    expect(byKey(items, "fin-bank")?.requirement).toBe("recommended");
  });

  it("mixed → bank + loan required, sponsor recommended", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "mixed" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(byKey(items, "fin-loan")?.requirement).toBe("required");
    expect(byKey(items, "fin-sponsor")?.requirement).toBe("recommended");
  });

  it("scholarship-dependent → informational award-letter item (kind null)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "scholarship-dependent" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-scholarship")).toMatchObject({ kind: null, status: "info", requirement: "required" });
  });

  it("unknown funding → general proof-of-funds bank item with the DHA figure", () => {
    const bank = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "fin-bank");
    expect(bank?.requirement).toBe("required");
    expect(bank?.note).toMatch(/29[,.]?710/);
  });

  it("attaches the DHA source to the first required financial item only", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "education-loan" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-loan")?.source?.url).toContain("immi.homeaffairs.gov.au");
    expect(byKey(items, "fin-bank")?.source).toBeUndefined();
  });

  it("adds the L3 seasoning recommendation by default; omits it for L2", () => {
    const l3 = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds });
    expect(byKey(l3, "fin-bank")?.note).toContain("stable, documented balance");
    const l2 = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds, nepalAssessmentLevel: "L2" });
    expect(byKey(l2, "fin-bank")?.note).not.toContain("stable, documented balance");
  });

  it("the permanently rejected F2 wording never returns (F2-A closure)", () => {
    const blob = JSON.stringify(
      generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds }),
    );
    expect(blob).not.toMatch(/Assessment Level/i);
    expect(blob).not.toMatch(/case officers?/i);
    expect(blob).not.toMatch(/AUD 5,000/);
  });

  it("adds the agent registration check (verify-MARN) as recommended now-stage guidance", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const agent = byKey(items, "agent-marn");
    expect(agent?.kind).toBeNull();
    expect(agent?.group).toBe("visa");
    expect(agent?.stage).toBe("now");
    expect(agent?.requirement).toBe("recommended");
    expect(agent?.note).toBe(
      "If you're using an agent, confirm them on the OMARA public register (search by MARN) before paying — DHA's guidance for anyone charging for immigration help.",
    );
    expect(agent?.source?.url).toContain("portal.mara.gov.au");
  });

  it("emits the sponsor income certification step only when sponsor income is in play (slice 6)", () => {
    const note =
      "In Nepal, sponsor income is typically certified at the local ward office — Lalitpur Metropolitan City publishes the document list: rental income needs the tenancy agreement; business or agricultural income the business-registration certificate plus audit report; salary or pension the original letter from the employer; fixed-deposit or savings interest a bank certificate; foreign income a recommendation letter authenticated by the Nepali embassy there or that country's embassy in Nepal. For an English income statement, include citizenship and relationship certificates.";
    const fam = generateChecklist({ program: baseProgram, sections: { finance: { source: "parents-family" } }, uploadedKinds: noKinds });
    const step = byKey(fam, "sponsor-income-cert");
    expect(step?.kind).toBeNull();
    expect(step?.group).toBe("financial");
    expect(step?.stage).toBe("now");
    expect(step?.requirement).toBe("recommended");
    expect(step?.infoKind).toBe("step");
    expect(step?.note).toBe(note);
    expect(step?.source?.url).toContain("lalitpurmun.gov.np");
    expect(byKey(generateChecklist({ program: baseProgram, sections: { finance: { source: "mixed" } }, uploadedKinds: noKinds }), "sponsor-income-cert")).toBeTruthy();
    expect(byKey(generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds }), "sponsor-income-cert")).toBeUndefined();
    expect(byKey(generateChecklist({ program: baseProgram, sections: { finance: { source: "education-loan" } }, uploadedKinds: noKinds }), "sponsor-income-cert")).toBeUndefined();
  });

  it("adds employment docs when work title is set", () => {
    const items = generateChecklist({ program: baseProgram, sections: { work: { title: "Analyst" } }, uploadedKinds: noKinds });
    expect(byKey(items, "employment-letter")).toBeTruthy();
    expect(byKey(items, "salary-slip")).toBeTruthy();
  });

  it("adds an employment letter for a study gap even with no job (no salary slip)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { gap: { years: 2 } }, uploadedKinds: noKinds });
    expect(byKey(items, "employment-letter")?.note).toContain("study gap");
    expect(keys(items)).not.toContain("salary-slip");
  });

  it("omits employment docs when neither work nor gap applies", () => {
    expect(keys(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }))).not.toContain("employment-letter");
  });

  it("places all visa documents in the after-offer stage, required", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    for (const k of ["offer-letter", "coe", "oshc", "medical"]) {
      expect(byKey(items, k)?.stage).toBe("after-offer");
      expect(byKey(items, k)?.requirement).toBe("required");
    }
  });

  it("includes the Genuine Student responses step after offer", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const gs = byKey(items, "gs-responses");
    expect(gs?.stage).toBe("after-offer");
    expect(gs?.group).toBe("visa");
    expect(gs?.kind).toBeNull();
    expect(gs?.infoKind).toBe("step");
    expect(gs?.source?.url).toContain("genuine-student-requirement");
  });

  it("sources the CoE item from DHA and states you need it for the visa", () => {
    const coe = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "coe");
    expect(coe?.note).toContain("student visa application");
    expect(coe?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("enriches the OSHC item with start timing + full duration and sources it", () => {
    const oshc = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "oshc");
    expect(oshc?.note).toContain("at least a week");
    expect(oshc?.note?.toLowerCase()).toContain("full");
    expect(oshc?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("states travel in the financial coverage note (still names the DHA figure)", () => {
    const bank = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "fin-bank");
    expect(bank?.note?.toLowerCase()).toContain("travel");
    expect(bank?.note).toMatch(/29[,.]?710/);
  });

  it("notes the DHA living-cost figure is indicative (B.011)", () => {
    const bank = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "fin-bank");
    expect(bank?.note).toContain("indicative");
    expect(bank?.note).toMatch(/29[,.]?710/); // still names the figure
  });

  it("adds the NRB remittance info item naming NOC + institution docs (B.012–B.016)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const remit = byKey(items, "fin-nrb-remittance");
    expect(remit).toMatchObject({
      kind: null, status: "info", group: "financial", stage: "now", label: "NOC + institution documents",
    });
    expect(remit?.note).toContain("No Objection Certificate");
    expect(remit?.note).toContain("institution letter");
    expect(remit?.note).toContain("Nepal Rastra Bank");
    expect(remit?.note).toContain("MoEST portal");
    expect(remit?.note).toContain("grants Nepalese students to study abroad");
    expect(remit?.source?.url).toContain("nrb.org.np");
  });

  it("adds the after-offer NOC application item with the MoEST documents + steps (B.017–B.024)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const noc = byKey(items, "noc-application");
    expect(noc).toMatchObject({
      kind: null, status: "info", group: "visa", stage: "after-offer", requirement: "required",
      label: "No Objection Certificate (NOC)",
    });
    expect(noc?.note).toContain("No Objection Certificate");
    expect(noc?.note).toContain("academic transcript");
    expect(noc?.note).toContain("original documents");
    expect(noc?.source?.url).toContain("moest.gov.np");
  });

  it("adds the document-preparation info item with translation + scoped certified-copy guidance (A.026–A.028, A.041–A.042)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const prep = byKey(items, "doc-preparation");
    expect(prep).toMatchObject({
      kind: null, status: "info", group: "identity", stage: "now", requirement: "required",
      label: "Translations & certified copies",
    });
    expect(prep?.note).toContain("translated into English");
    expect(prep?.note).toContain("outside Australia");
    expect(prep?.note).toContain("certified copies of some identity documents");
    expect(prep?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("enriches the medical item with the DHA health-exam process + validity (A.033, A.035, A.036, A.038)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const med = byKey(items, "medical");
    expect(med?.note).toContain("panel physician or clinic");
    expect(med?.note).toContain("My Health Declarations");
    expect(med?.note).toContain("12 months");
    expect(med?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("adds the after-offer biometrics info item; SourceLine points at the C.127 fee page, not A.031 (A.031 + reuse C.123/C.127)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const bio = byKey(items, "biometrics");
    expect(bio).toMatchObject({
      kind: null, status: "info", group: "visa", stage: "after-offer", requirement: "required",
      label: "Biometrics letter",
    });
    expect(bio?.note).toContain("biometrics program");
    expect(bio?.note).toContain("NPR");
    expect(bio?.note).toMatch(/2[,.]?365/); // locale-tolerant (matches the 29,710 assertions)
    expect(bio?.note).toContain("AUI");
    // source-display guard: the visible SourceLine is the fee/biometrics page (C.127), not A.031's Immi App page
    expect(bio?.source?.url).toContain("vfsglobal.com");
  });

  it("adds the after-offer police-certificate info item with the DHA rule + Nepal framing (A.039)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const police = byKey(items, "police-certificate");
    expect(police).toMatchObject({
      kind: null, status: "info", group: "visa", stage: "after-offer", requirement: "recommended",
      label: "Police certificate",
    });
    expect(police?.note).toContain("12 months or more");
    expect(police?.note).toContain("after you turned 16");
    expect(police?.note).toContain("Nepal Police character certificate");
    expect(police?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("surfaces the Nepal OPCR document set in the police note (A.100)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const police = byKey(items, "police-certificate");
    expect(police?.note).toContain("passport pages 1 to 3");
    expect(police?.note).toContain("citizenship certificate");
  });

  it("adds a conditional how-to-start note to the passport row only when no passport is uploaded (A.043/A.044)", () => {
    const missing = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const p = byKey(missing, "passport");
    expect(p?.kind).toBe("passport"); // still a document row (Have/Needed), not an info item
    expect(p?.note).toContain("pre-enrolment");
    expect(p?.note).toContain("enrolment centre");
    expect(p?.source?.url).toContain("nepalpassport.gov.np");

    const uploaded = generateChecklist({
      program: baseProgram, sections: {}, uploadedKinds: new Set<DocumentKind>(["passport"]),
    });
    const p2 = byKey(uploaded, "passport");
    expect(p2?.status).toBe("have");
    expect(p2?.note).toBeUndefined();
    expect(p2?.source).toBeUndefined();
  });

  it("tags kind:null info items with infoKind (step for after-offer process, note for now-stage reference)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "scholarship-dependent" } }, uploadedKinds: noKinds });
    const expectInfo = (key: string, infoKind: "step" | "note") =>
      expect(byKey(items, key)).toMatchObject({ kind: null, status: "info", infoKind });
    expectInfo("doc-preparation", "note");
    expectInfo("fin-nrb-remittance", "note");
    expectInfo("fin-scholarship", "note");
    expectInfo("noc-application", "step");
    expectInfo("biometrics", "step");
    expectInfo("police-certificate", "step");
    expect(byKey(items, "passport")?.infoKind).toBeUndefined(); // documents carry no infoKind
  });

  it("tags the AHPRA info item as note", () => {
    const items = generateChecklist({ program: { ...baseProgram, field: "nursing" }, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "ahpra")).toMatchObject({ kind: null, status: "info", infoKind: "note" });
  });

  // MV-52: wire the already-ledgered Nepal doc-acquisition datasets onto the rows that
  // were missing them — the transcript row (TU equivalence turnaround, A.087) and the
  // English row (IELTS test-centre logistics, J1). No new data; pure wiring.
  it("attaches TU academic-equivalence processing-time guidance to the bachelor's transcript (MV-52, A.087)", () => {
    const txn = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "bachelors-transcript");
    expect(txn?.kind).toBe("bachelors-transcript"); // still a document row, not an info item
    expect(txn?.note).toContain("Tribhuvan University");
    expect(txn?.note).toContain("equivalence");
    expect(txn?.note).toContain("3 working days"); // typicalBusinessDays from the dataset
    expect(txn?.source?.url).toBe("https://tucdc.edu.np/faq");
    expect(txn?.source?.lastVerified).toBe("2026-06-05");
  });

  it("attaches the same equivalence guidance to the master's transcript for a doctorate program (MV-52)", () => {
    const items = generateChecklist({ program: { ...baseProgram, level: "doctorate" }, sections: {}, uploadedKinds: noKinds });
    const mtxn = byKey(items, "masters-transcript");
    expect(mtxn?.note).toContain("equivalence");
    expect(mtxn?.source?.url).toBe("https://tucdc.edu.np/faq");
  });

  it("adds a Nepal IELTS test-centre logistics info step when the test is (or defaults to) IELTS (MV-52, J1)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { english: { test: "ielts" } }, uploadedKinds: noKinds });
    const centres = byKey(items, "ielts-centres");
    expect(centres).toMatchObject({
      kind: null, status: "info", group: "english", stage: "now", requirement: "recommended", infoKind: "step",
    });
    expect(centres?.note).toContain("British Council");
    expect(centres?.note).toContain("IDP");
    expect(centres?.note).toContain("Kathmandu");
    expect(centres?.note).toContain("9 locations"); // British Council locationCount
    expect(centres?.note).toContain("36,000"); // IDP computer-delivered fee (NPR), locale-formatted
    expect(centres?.source?.url).toContain("britishcouncil.org.np");
    // default (no english section) also defaults to IELTS → the row is present
    expect(byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "ielts-centres")).toBeTruthy();
  });

  it("does NOT fabricate test-centre logistics for PTE or TOEFL — only IELTS is sourced (MV-52)", () => {
    expect(keys(generateChecklist({ program: baseProgram, sections: { english: { test: "pte" } }, uploadedKinds: noKinds }))).not.toContain("ielts-centres");
    expect(keys(generateChecklist({ program: baseProgram, sections: { english: { test: "toefl" } }, uploadedKinds: noKinds }))).not.toContain("ielts-centres");
  });
});
