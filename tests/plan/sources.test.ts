import { describe, it, expect } from "vitest";
import { sourcesFor } from "@/lib/plan/sources";
import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { AU_WORKING_WITH_AGENTS } from "@/lib/data/source/au-working-with-agents";
import { NEPAL_DOCUMENT_PROCESSING_TIMES } from "@/lib/data/source/nepal-document-processing-times";
import { NEPAL_POLICE_CERTIFICATE } from "@/lib/data/source/nepal-police-certificate";
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NEPAL_INCOME_CERTIFICATION } from "@/lib/data/source/nepal-income-certification";
import { AU_ENROLMENT_LODGEMENT_SOURCES } from "@/lib/data/source/au-enrolment-lodgement";
import { AU_SUBCLASS_500_APPLICATION_CHARGE_AUD } from "@/lib/data/policy/au-visa-fees";

/**
 * The plan source map (lib/plan/sources.ts) holds LITERAL URLs/dates so it can be
 * imported into the client PlanItemCard without bundling the sourced-config /
 * scoring layer. This test is the single-source-of-truth guard: every literal must
 * equal the canonical sourced data module, so a stale plan link fails here rather
 * than quietly pointing a user at the wrong (or outdated) authority.
 */
describe("plan sources drift guard", () => {
  it("upload-proof-of-funds → DHA living-capacity figure", () => {
    const src = sourcesFor("upload-proof-of-funds")[0]!;
    expect(src.url).toBe(AU_DHA_LIVING_CAPACITY_AUD.provenance.source);
    expect(src.lastVerified).toBe(AU_DHA_LIVING_CAPACITY_AUD.provenance.lastVerified);
  });

  it("prepare-biometrics → VFS Kathmandu biometric collection fee", () => {
    const fee = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "vfs-kathmandu-biometric-collection-fee")!;
    const src = sourcesFor("prepare-biometrics")[0]!;
    expect(src.url).toBe(fee.source);
    expect(src.lastVerified).toBe(fee.lastVerified);
  });

  it("apply-for-noc → MoEST NOC portal", () => {
    const noc = NEPAL_NOC_JOURNEY.find((r) => r.id === "noc-doc-citizenship")!;
    const src = sourcesFor("apply-for-noc")[0]!;
    expect(src.url).toBe(noc.source);
    expect(src.lastVerified).toBe(noc.lastVerified);
  });

  it("verify-agent-marn → OMARA public register", () => {
    const marn = AU_WORKING_WITH_AGENTS.find((r) => r.id === "verify-marn")!;
    const src = sourcesFor("verify-agent-marn")[0]!;
    expect(src.url).toBe(marn.source);
    expect(src.lastVerified).toBe(marn.lastVerified);
  });

  it("prepare-health-exam → DHA health-examination validity", () => {
    const fact = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!;
    const src = sourcesFor("prepare-health-exam")[0]!;
    expect(src.url).toBe(fact.source);
    expect(src.lastVerified).toBe(fact.lastVerified);
  });

  it("prepare-police-certificate → Nepal Police OPCR (one portal for turnaround + validity)", () => {
    const turnaround = NEPAL_DOCUMENT_PROCESSING_TIMES.find((r) => r.id === "police-character-standard")!;
    const validity = NEPAL_POLICE_CERTIFICATE.find((r) => r.id === "opcr-validity")!;
    const src = sourcesFor("prepare-police-certificate")[0]!;
    expect(src.url).toBe(turnaround.source);
    expect(src.url).toBe(validity.source); // both OPCR figures share the one portal URL
    expect(src.lastVerified).toBe(turnaround.lastVerified);
  });

  it("start-passport-process → Department of Passports", () => {
    const passport = NEPAL_DOCUMENT_PROCESSING_TIMES.find((r) => r.id === "passport-central")!;
    const src = sourcesFor("start-passport-process")[0]!;
    expect(src.url).toBe(passport.source);
    expect(src.lastVerified).toBe(passport.lastVerified);
  });

  it("prepare-gs-answers → DHA Genuine Student requirement", () => {
    const gs = AU_STUDENT_VISA_REQUIREMENTS.find((r) => r.id === "genuine-student")!;
    const src = sourcesFor("prepare-gs-answers")[0]!;
    expect(src.url).toBe(gs.source);
    expect(src.lastVerified).toBe(gs.lastVerified);
  });

  it("prepare-fund-remittance → NRB study-remittance rules + NRB annual report (two pages)", () => {
    const study = NEPAL_SOURCE_OF_FUNDS.find((r) => r.id === "noc-requirement")!;
    const annual = NEPAL_SOURCE_OF_FUNDS.find((r) => r.id === "forex-portal-confirmation")!;
    const [bankReq, forex] = sourcesFor("prepare-fund-remittance");
    expect(bankReq!.url).toBe(study.source);
    expect(bankReq!.lastVerified).toBe(study.lastVerified);
    expect(forex!.url).toBe(annual.source);
    expect(forex!.lastVerified).toBe(annual.lastVerified);
  });

  it("certify-sponsor-income → Lalitpur Metropolitan City FAQ", () => {
    const lmc = NEPAL_INCOME_CERTIFICATION.find((r) => r.id === "rental-income")!;
    const src = sourcesFor("certify-sponsor-income")[0]!;
    expect(src.url).toBe(lmc.source);
    expect(src.lastVerified).toBe(lmc.lastVerified);
  });

  it("season-funds-six-months carries no source (a recommendation, not a published figure)", () => {
    expect(sourcesFor("season-funds-six-months")).toEqual([]);
  });

  // MV-57 journey-spine connective steps.
  it("submit-university-applications → Study Australia how-to-apply", () => {
    const howTo = AU_ENROLMENT_LODGEMENT_SOURCES.find((r) => r.id === "study-australia-how-to-apply")!;
    const src = sourcesFor("submit-university-applications")[0]!;
    expect(src.url).toBe(howTo.source);
    expect(src.lastVerified).toBe(howTo.lastVerified);
  });

  it("accept-offer → Study Australia how-to-apply", () => {
    const howTo = AU_ENROLMENT_LODGEMENT_SOURCES.find((r) => r.id === "study-australia-how-to-apply")!;
    const src = sourcesFor("accept-offer")[0]!;
    expect(src.url).toBe(howTo.source);
    expect(src.lastVerified).toBe(howTo.lastVerified);
  });

  it("get-coe → in-repo CoE requirement row (DHA web-evidentiary-tool)", () => {
    const coe = AU_STUDENT_VISA_REQUIREMENTS.find((r) => r.id === "coe")!;
    const src = sourcesFor("get-coe")[0]!;
    expect(src.url).toBe(coe.source);
    expect(src.lastVerified).toBe(coe.lastVerified);
  });

  it("arrange-oshc → in-repo OSHC requirement row (DHA web-evidentiary-tool)", () => {
    const oshc = AU_STUDENT_VISA_REQUIREMENTS.find((r) => r.id === "oshc")!;
    const src = sourcesFor("arrange-oshc")[0]!;
    expect(src.url).toBe(oshc.source);
    expect(src.lastVerified).toBe(oshc.lastVerified);
  });

  it("lodge-subclass-500 → DHA Subclass 500 application-charge listing", () => {
    const src = sourcesFor("lodge-subclass-500")[0]!;
    expect(src.url).toBe(AU_SUBCLASS_500_APPLICATION_CHARGE_AUD.provenance.source);
    expect(src.lastVerified).toBe(AU_SUBCLASS_500_APPLICATION_CHARGE_AUD.provenance.lastVerified);
  });

  it("track-visa-decision → DHA after-you-apply", () => {
    const after = AU_ENROLMENT_LODGEMENT_SOURCES.find((r) => r.id === "dha-after-you-apply")!;
    const src = sourcesFor("track-visa-decision")[0]!;
    expect(src.url).toBe(after.source);
    expect(src.lastVerified).toBe(after.lastVerified);
  });
});
