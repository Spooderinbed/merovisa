import type { WorkingWithAgentsFact } from "@/lib/data/types";

/**
 * Working-with-agents gov-core module (slice ③). Government-sourced facts on using an
 * education/migration agent for an Australian student visa, in five sections. Every row links
 * to its primary gov page; provenance.findingRefs lists the backing finding (1:1 — these gov
 * facts are atomic). Prose-only: nothing here is a number the reconciler must match (the AUD 510
 * in `avg-commission` renders as narrative, not a typed config). Fact-only: no scorer reads it.
 */
const MARA_REGISTER = "https://www.mara.gov.au/steps-to-register/overview";
const MARA_HOW_HELP =
  "https://www.mara.gov.au/get-help-with-a-visa/help-from-registered-agents/how-registered-agents-can-help";
const MARA_PORTAL_SEARCH = "https://portal.mara.gov.au/search-the-register-of-migration-agents/";
const MARA_NOT_REGISTERED = "https://www.mara.gov.au/get-help-with-a-visa/helpers-not-registered";
const MARA_CHOOSE_OVERVIEW =
  "https://www.mara.gov.au/get-help-with-a-visa/help-from-registered-agents/steps-to-choose/overview";
const MARA_CHOOSE_STEPS =
  "https://www.mara.gov.au/get-help-with-a-visa/help-from-registered-agents/steps-to-choose/step-by-step";
const MARA_AGENT_MUST_DO =
  "https://www.mara.gov.au/get-help-with-a-visa/help-from-registered-agents/steps-to-choose/after-you-choose-a-registered-agent/what-your-agent-must-do";
const FORM_956 = "https://immi.homeaffairs.gov.au/form-listing/forms/956.pdf";
const DHA_VISA_SCAMS = "https://immi.homeaffairs.gov.au/help-support/visa-scams/what-you-need-to-know";
const STUDY_AU_COMMISSIONS =
  "https://www.studyaustralia.gov.au/en/Agent-Hub/agent-news-index/new-rules-on-agent-commissions-for-onshore-student-transfers";
const OIA_IMPACT =
  "https://oia.pmc.gov.au/sites/default/files/posts/2026/01/Onshore%20transfer%20commission%20ban%20-%20Impact%20Analysis%20Addendum%202026%20-%20CLEAN_0.pdf";
const VERIFIED = "2026-06-05";

export const AU_WORKING_WITH_AGENTS: WorkingWithAgentsFact[] = [
  // ── Do you need an agent? ─────────────────────────────────────────────────────
  {
    id: "agent-optional",
    section: "do-you-need-one",
    label: "OMARA",
    summary: "You don't have to use a registered migration agent — you can apply for the visa yourself.",
    source: MARA_HOW_HELP,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.075"], source: MARA_HOW_HELP },
  },
  {
    id: "who-can-assist",
    section: "do-you-need-one",
    label: "OMARA",
    summary:
      'Immigration assistance can only be given by registered migration agents, Australian legal practitioners, or limited "exempt persons".',
    source: MARA_REGISTER,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.074"], source: MARA_REGISTER },
  },
  {
    id: "agent-complex-cases",
    section: "do-you-need-one",
    label: "OMARA",
    summary: "OMARA says a registered agent may be especially helpful if your case is complex.",
    source: MARA_HOW_HELP,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.076"], source: MARA_HOW_HELP },
  },
  {
    id: "pay-use-registered",
    section: "do-you-need-one",
    label: "DHA scams",
    summary:
      "If you pay for immigration help, the Department says use a registered migration agent listed with OMARA.",
    source: DHA_VISA_SCAMS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.084"], source: DHA_VISA_SCAMS },
  },
  // ── Check the register first ──────────────────────────────────────────────────
  {
    id: "verify-marn",
    section: "verify-register",
    label: "OMARA register",
    summary: "Confirm your agent on the OMARA public register — you can search it by their MARN.",
    source: MARA_PORTAL_SEARCH,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.077"], source: MARA_PORTAL_SEARCH },
  },
  {
    id: "agent-standards",
    section: "verify-register",
    label: "OMARA",
    summary: "Registered agents must keep meeting OMARA's professional standards to stay on the register.",
    source: MARA_CHOOSE_OVERVIEW,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.085"], source: MARA_CHOOSE_OVERVIEW },
  },
  // ── What your agent owes you ──────────────────────────────────────────────────
  {
    id: "owes-documents",
    section: "what-they-owe",
    label: "OMARA",
    summary: "Your agent must give you the documents the Department sends about your case.",
    source: MARA_AGENT_MUST_DO,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.088"], source: MARA_AGENT_MUST_DO },
  },
  {
    id: "owes-updates",
    section: "what-they-owe",
    label: "OMARA",
    summary: "Your agent must keep you updated on your visa application's progress.",
    source: MARA_AGENT_MUST_DO,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.089"], source: MARA_AGENT_MUST_DO },
  },
  {
    id: "owes-fee-agreement",
    section: "what-they-owe",
    label: "Choosing an agent",
    summary:
      "OMARA lists agreeing the written service agreement and fees as a step in choosing an agent — settle it upfront.",
    source: MARA_CHOOSE_STEPS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.087"], source: MARA_CHOOSE_STEPS },
  },
  {
    id: "exempt-no-charge",
    section: "what-they-owe",
    label: "OMARA",
    summary: '"Exempt persons" must not charge a fee for immigration assistance.',
    source: MARA_NOT_REGISTERED,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.079"], source: MARA_NOT_REGISTERED },
  },
  // ── Formal representation ─────────────────────────────────────────────────────
  {
    id: "form-956",
    section: "formal-representation",
    label: "Form 956",
    summary: "Form 956 is what formally appoints a registered agent, legal practitioner, or exempt person to act for you.",
    source: FORM_956,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.080"], source: FORM_956 },
  },
  {
    id: "authorised-recipient",
    section: "formal-representation",
    label: "Form 956",
    summary:
      "Once you appoint an authorised recipient, the Department sends all written communication about your visa to them.",
    source: FORM_956,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.081"], source: FORM_956 },
  },
  // ── The 2026 commission ban ───────────────────────────────────────────────────
  {
    id: "commission-ban",
    section: "commission-ban",
    label: "Study Australia",
    summary:
      "Education providers cannot pay agent commissions for student transfers between onshore providers after 31 March 2026.",
    source: STUDY_AU_COMMISSIONS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.090"], source: STUDY_AU_COMMISSIONS },
  },
  {
    id: "hidden-commissions",
    section: "commission-ban",
    label: "Impact analysis",
    summary: "The ban's definition is written to catch hidden commissions too — including bonuses.",
    source: OIA_IMPACT,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.092"], source: OIA_IMPACT },
  },
  {
    id: "avg-commission",
    section: "commission-ban",
    label: "Impact analysis",
    summary: "The government's analysis put the 2025 average onshore-transfer commission at about AUD 510.",
    source: OIA_IMPACT,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.094"], source: OIA_IMPACT },
  },
  {
    id: "direct-pay-risk",
    section: "commission-ban",
    label: "Impact analysis",
    summary: "The government warned that direct payments to agents for transfers could expose students to exploitation.",
    source: OIA_IMPACT,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.096"], source: OIA_IMPACT },
  },
];
