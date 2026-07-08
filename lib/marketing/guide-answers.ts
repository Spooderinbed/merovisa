// lib/marketing/guide-answers.ts
import type { GuideKey } from "./provenance";

export interface GuideExchange {
  key: GuideKey;
  chip: string;
  q: string;
  a: string;
  source: string;
  verified: string;
}

export const GUIDE_ANSWERS: Record<GuideKey, GuideExchange> = {
  ielts: {
    key: "ielts",
    chip: "Is 6.5 enough?",
    q: "I got 6.5 overall. Is that actually enough?",
    a: "Good news for your shortlist: 6.5 overall (nothing below 6.0) already meets the bar. Pushing to 7.0 opens your reach programs and firms up your Genuine Student case.",
    source: "Home Affairs",
    verified: "Jun 2026",
  },
  funds: {
    key: "funds",
    chip: "Does the money have to be mine?",
    q: "Does the bank balance have to be my own money?",
    a: "For your Australia plan, you'd show A$29,710 in living costs plus your first-year tuition and travel, genuinely yours and available, not borrowed just for the visa.",
    source: "Home Affairs s.500",
    verified: "Jun 2026",
  },
  gte: {
    key: "gte",
    chip: "What if they think I'll migrate?",
    q: "What if they think I just want to migrate, not study?",
    a: "It comes down to whether an officer believes you mean to study, not migrate. With your profile, that's about showing why this course and why now, which is exactly what we'd help you put together.",
    source: "Home Affairs",
    verified: "Jun 2026",
  },
};

export const GUIDE_ORDER: GuideKey[] = ["ielts", "funds", "gte"];
