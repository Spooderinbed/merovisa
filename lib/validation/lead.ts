import { z } from "zod";

export const LeadSchema = z.object({
  email: z.email(),
  assessmentId: z.guid(),
});

export type LeadInput = z.infer<typeof LeadSchema>;
