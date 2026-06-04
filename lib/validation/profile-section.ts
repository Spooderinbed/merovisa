import { z } from "zod";

const PersonalPatch = z.object({
  name: z.string().min(1).max(120).optional(),
  age: z.number().int().min(15).max(80).optional(),
  intakeIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PersonalSectionPatch = z.infer<typeof PersonalPatch>;
export const PersonalSectionPatchSchema = PersonalPatch;

const DestinationPatch = z.object({
  primary: z.string().min(1).max(40).optional(),
  alternates: z.array(z.string().min(1).max(40)).max(5).optional(),
});
const AcademicPatch = z.object({
  institution: z.string().min(1).max(200).optional(),
  degree: z.enum(["high-school","bachelors","masters","doctorate"]).optional(),
  gradePercent: z.number().min(0).max(100).optional(),
  gradeSystem: z.string().min(1).max(80).optional(),
});
const IntendedStudyPatch = z.object({
  level: z.enum(["bachelors","masters","doctorate"]).optional(),
  field: z.string().min(1).max(80).optional(),
  specialisation: z.string().min(1).max(160).optional(),
});
const EnglishPatch = z.object({
  test: z.enum(["ielts","pte","toefl"]).optional(),
  overall: z.number().min(0).max(9).optional(),
  reportUploaded: z.boolean().optional(),
});
const GapPatch = z.object({
  years: z.number().int().min(0).max(20).optional(),
  reasons: z.array(z.string().min(1).max(60)).max(5).optional(),
  evidence: z.array(z.string().min(1).max(160)).max(5).optional(),
});
const WorkPatch = z.object({
  title: z.string().min(1).max(120).optional(),
  years: z.number().min(0).max(40).optional(),
  relevance: z.enum(["directly-related","related","unrelated"]).optional(),
  docs: z.boolean().optional(),
});
const FinancePatch = z.object({
  total: z.number().min(0).max(1_000_000_000).optional(),
  currency: z.enum(["NPR","USD","AUD","INR","BDT","PKR","NGN"]).optional(),
  source: z.enum(["self","parents","loan","scholarship","mixed"]).optional(),
  proofUploaded: z.boolean().optional(),
});
const ImmigrationPatch = z.object({
  refusals: z.enum(["none","one","multiple"]).optional(),
  travelled: z.boolean().optional(),
});
const FamilyPatch = z.object({
  situation: z.enum(["alone","spouse","spouse-and-kids","other"]).optional(),
});
const CareerPatch = z.object({
  goal: z.enum(["permanent-residency","jobs-abroad","back-home","experience"]).optional(),
  targetRole: z.string().min(1).max(120).optional(),
});
const ScholarshipsPatch = z.object({
  profile: z.array(z.string().min(1).max(80)).max(8).optional(),
});
const DealBreakersPatch = z.object({
  mustHaves: z.array(z.string().min(1).max(80)).max(10).optional(),
});

export const ProfileSectionPatchBodySchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("personal"), patch: PersonalPatch }),
  z.object({ section: z.literal("destination"), patch: DestinationPatch }),
  z.object({ section: z.literal("academic"), patch: AcademicPatch }),
  z.object({ section: z.literal("intended-study"), patch: IntendedStudyPatch }),
  z.object({ section: z.literal("english"), patch: EnglishPatch }),
  z.object({ section: z.literal("gap"), patch: GapPatch }),
  z.object({ section: z.literal("work"), patch: WorkPatch }),
  z.object({ section: z.literal("finance"), patch: FinancePatch }),
  z.object({ section: z.literal("immigration"), patch: ImmigrationPatch }),
  z.object({ section: z.literal("family"), patch: FamilyPatch }),
  z.object({ section: z.literal("career"), patch: CareerPatch }),
  z.object({ section: z.literal("scholarships"), patch: ScholarshipsPatch }),
  z.object({ section: z.literal("deal-breakers"), patch: DealBreakersPatch }),
]);
export type ProfileSectionPatchBody = z.infer<typeof ProfileSectionPatchBodySchema>;
