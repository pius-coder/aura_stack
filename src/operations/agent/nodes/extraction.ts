import { z } from "zod";
export const ExtractionSchema = z.object({
  skills: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  needs: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ExtractionResult = z.infer<typeof ExtractionSchema>;
