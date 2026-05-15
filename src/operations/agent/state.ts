import { z } from 'zod';
export const AgentStateSchema = z.object({
  userId: z.string(),
  language: z.enum(['FR','EN']).default('FR'),
  lastIntent: z.string().optional(),
  extractedEntities: z.array(z.object({ type: z.string(), value: z.string(), confidence: z.number() })).default([]),
});
export type AgentState = z.infer<typeof AgentStateSchema>;
