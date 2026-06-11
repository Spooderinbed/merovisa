import posthog from "posthog-js";
import type { Destination, Verdict } from "@/lib/scoring/types";

/**
 * The explicit analytics catalog — the ONLY events this app may emit, and the
 * only call surface (`track`). Payload fields are stable ids and closed enums;
 * never names, free text, scores beyond the verdict band, emails, or URLs with
 * params. Guardrails pinned by tests/analytics/events.test.ts; design spec:
 * docs/superpowers/specs/2026-06-10-analytics-instrumentation-design.md.
 */

/** Where a source link was clicked — only surfaces that render outbound source anchors. */
export type SourceSurface =
  | "factor-bars"
  | "refusal-recovery"
  | "cost-to-apply"
  | "checklist"
  | "matches"
  | "genuine-student";

export type AnalyticsEvents = {
  /** Wizard step mount. `step` is the WizardStepKey id. */
  wizard_step_viewed: { step: string };
  /** Wizard submitted (before scoring/redirect). */
  wizard_completed: { destination: Destination };
  /** Results mount with a rendered verdict. Band only — never the score. */
  assessment_viewed: { mode: "anonymous" | "owned"; band: Verdict };
  /** Outbound click on a sourced fact — the lane's primary trust signal. */
  source_link_clicked: { surface: SourceSurface; domain: string };
  /** Any anonymous-results gate CTA (blurred teasers, locked matches). */
  gate_cta_clicked: undefined;
  /** Dashboard prompt-card CTA. `kind` is the plan-item kind id when state is "next". */
  dashboard_cta_clicked: {
    state: "profile-incomplete" | "next" | "waiting" | "caught-up";
    kind?: string;
  };
  /** Plan card mutation confirmed by the API. `kind` is the plan-item kind id. */
  plan_action: { kind: string; action: "done" | "dismissed" | "started" | "reopened" };
  /** "Track in your plan →" on a checklist item. `key` is the checklist item id. */
  checklist_plan_link_clicked: { key: string };
  /** First authed mount per page session (fires alongside identify). */
  signed_in: undefined;
};

export type AnalyticsEventName = keyof AnalyticsEvents;

/** Analytics is opt-in by env: without a key every call is a silent no-op. */
const enabled = (): boolean => Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

export function track<E extends AnalyticsEventName>(
  event: E,
  ...props: AnalyticsEvents[E] extends undefined ? [] : [AnalyticsEvents[E]]
): void {
  if (!enabled()) return;
  posthog.capture(event, props[0]);
}

/** Ties pre-signup events to the account. Supabase UUID only — no email, no name. */
export function identify(userId: string): void {
  if (!enabled()) return;
  posthog.identify(userId);
}
