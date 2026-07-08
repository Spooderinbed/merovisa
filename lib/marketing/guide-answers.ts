// lib/marketing/guide-answers.ts
import type { GuideKey } from "./provenance";

export interface GuideExchange {
  q: string;
  a: string;
  c: string;
}

export const GUIDE_ANSWERS: Record<GuideKey, GuideExchange> = {
  ielts: {
    q: "I got 6.5 overall. Is that actually enough?",
    a: "Good news for your shortlist: 6.5 overall (nothing below 6.0) already meets the bar. Pushing to 7.0 opens your reach programs and firms up your Genuine Student case.",
    c: "Home Affairs · Jun 2026",
  },
  funds: {
    q: "Does the bank balance have to be my own money?",
    a: "For your Australia plan, you'd show A$29,710 in living costs plus your first-year tuition and travel, genuinely yours and available, not borrowed just for the visa.",
    c: "Home Affairs s.500 · Jun 2026",
  },
  gte: {
    q: "What if they think I just want to migrate, not study?",
    a: "It comes down to whether an officer believes you mean to study, not migrate. With your profile, that's about showing why this course and why now, which is exactly what we'd help you put together.",
    c: "Home Affairs · Jun 2026",
  },
};

export const GUIDE_ORDER: GuideKey[] = ["ielts", "funds", "gte"];
