import "server-only";
import type { AssessmentPayload } from "@/lib/results/types";
import type { PlanItemRow } from "@/lib/plan/types";
import { selectCostToApply } from "@/lib/data/cost-to-apply";

/**
 * Assembles the grounding block the AI guide reasons over. The guide explains the
 * rule-based engine's output — it never re-derives or invents one — so this block
 * carries only what the student has already been shown: the banded verdict, the
 * human-readable factor reasons, their top matches, their open plan, and the
 * sourced cost-to-apply corridor data. Every external figure keeps its source so
 * the model can cite it.
 *
 * Trust boundary: the raw scoring internals (dimension values, the weighted total,
 * per-match score gaps) are deliberately omitted. Users never see a percentage and
 * neither does the guide — only the banded words and the prose reasons.
 */

const VERDICT_LABEL: Record<string, string> = {
  strong: "Strong match",
  possible: "Possible",
  reach: "Reach",
};

const INFLUENCE_WORD: Record<string, string> = {
  positive: "strength",
  neutral: "neutral",
  risk: "concern",
};

const MAX_MATCHES = 5;
const MAX_PLAN = 6;

export interface GuideContextInput {
  payload: AssessmentPayload | null;
  planItems: PlanItemRow[];
}

function sourceTag(url?: string, lastVerified?: string): string {
  if (!url) return "";
  return lastVerified ? ` [source: ${url}, verified ${lastVerified}]` : ` [source: ${url}]`;
}

function factorLines(payload: AssessmentPayload): string[] {
  const lines: string[] = [];
  for (const dim of Object.values(payload.result.dimensions)) {
    for (const f of dim.factors) {
      lines.push(`- ${f.label} (${INFLUENCE_WORD[f.influence] ?? f.influence}): ${f.detail}${sourceTag(f.source?.url, f.source?.lastVerified)}`);
    }
  }
  return lines;
}

function matchLines(payload: AssessmentPayload): string[] {
  return payload.matches.slice(0, MAX_MATCHES).map((m) => {
    const verdict = VERDICT_LABEL[m.verdict] ?? m.verdict;
    const reason = m.reasons[0]?.text ? ` ${m.reasons[0].text}` : "";
    const evidence = m.evidence
      ? ` Evidence level for a Nepal passport: ${m.evidence.level}${sourceTag(m.evidence.source)}.`
      : "";
    return `- ${m.university.name}, ${m.university.city} — ${m.program.name} (${m.program.level}): ${verdict}.${reason}${evidence}`;
  });
}

function secondaryVerdictLines(payload: AssessmentPayload): string[] {
  const sv = payload.secondaryVerdicts;
  if (!sv || sv.items.length === 0) return [];
  // Field label + band WORD only — never a numeric score. Matches what the student
  // sees on the results page so the guide can't contradict a secondary band.
  return sv.items.map(
    (item) => `- If they applied under ${item.label} instead: ${VERDICT_LABEL[item.verdict] ?? item.verdict}`,
  );
}

function planLines(planItems: PlanItemRow[]): string[] {
  return planItems.slice(0, MAX_PLAN).map((p) => `- ${p.title} (${p.impact} impact)${p.body ? `: ${p.body}` : ""}`);
}

function costSection(): string {
  const cost = selectCostToApply();
  const blocks = cost.groups.map((g) => {
    const lines = g.lines.map(
      (l) =>
        `  - ${l.label}: ${l.amount}${l.amountMax ? `–${l.amountMax}` : ""} ${l.currency}${sourceTag(l.source, l.lastVerified)}`,
    );
    return [`${g.heading}:`, ...lines].join("\n");
  });
  return ["Cost to apply (sourced corridor data):", ...blocks, cost.note].join("\n");
}

export function buildGuideContext({ payload, planItems }: GuideContextInput): string {
  const sections: string[] = [
    "STUDENT CONTEXT — Nepal → Australia. Ground every answer in the facts below. Use the banded verdict word, never a number. Cite the named source for any corridor figure.",
  ];

  if (!payload) {
    sections.push(
      "The student has not completed an assessment yet, so there is no verdict, match list, or factor breakdown to ground answers in. Encourage them to run the 9-step assessment; do not invent a verdict or matches.",
    );
  } else {
    sections.push(`Overall standing: ${VERDICT_LABEL[payload.result.verdict] ?? payload.result.verdict}`);

    const factors = factorLines(payload);
    if (factors.length) sections.push(["What shaped this verdict:", ...factors].join("\n"));

    const matches = matchLines(payload);
    if (matches.length) sections.push(["Top program matches:", ...matches].join("\n"));

    const secondary = secondaryVerdictLines(payload);
    if (secondary.length) {
      sections.push(
        [
          "Fields they are also considering (banded standing only — the primary verdict above is unchanged):",
          ...secondary,
        ].join("\n"),
      );
    }
  }

  const plan = planLines(planItems);
  if (plan.length) sections.push(["The student's open next steps:", ...plan].join("\n"));

  sections.push(costSection());

  return sections.join("\n\n");
}
