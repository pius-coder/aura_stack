import { z } from "zod";
export const IntentSchema = z.object({
  intent: z.enum(["chat", "search_provider", "search_connection", "account", "help"]),
  confidence: z.number().min(0).max(1),
  constraints: z.object({
    skills: z.array(z.string()).optional(),
    location: z.string().optional(),
    industry: z.string().optional(),
    budgetMaxXaf: z.number().optional(),
  }).optional(),
});
export type IntentResult = z.infer<typeof IntentSchema>;
export const INTENT_THRESHOLD = 0.7;
