import { z } from "zod";

export const PersonalSectionPatchSchema = z.object({
  name:      z.string().min(1).max(120).optional(),
  age:       z.number().int().min(15).max(80).optional(),
  intakeIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PersonalSectionPatch = z.infer<typeof PersonalSectionPatchSchema>;

// In Phase 1.5 only "personal" is patchable. Other section keys are intentionally rejected.
export const ProfileSectionPatchBodySchema = z.object({
  section: z.literal("personal"),
  patch: PersonalSectionPatchSchema,
});
export type ProfileSectionPatchBody = z.infer<typeof ProfileSectionPatchBodySchema>;
