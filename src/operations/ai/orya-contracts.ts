import { z } from "zod";

export const OryaIntentSchema = z.enum([
  "chat",
  "search_provider",
  "search_connection",
  "account",
  "help",
  "selection",
]);

export type OryaIntent = z.infer<typeof OryaIntentSchema>;

export const OryaExtractionPayloadSchema = z.object({
  skills: z.array(z.string()).default([]),
  needs: z.array(z.string()).default([]),
  location: z.string().optional(),
  industry: z.string().optional(),
  budgetMaxXaf: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type OryaExtractionPayload = z.infer<
  typeof OryaExtractionPayloadSchema
>;

export const OryaMatchPresentationSchema = z.object({
  rank: z.number().int().min(1),
  userId: z.string(),
  alias: z.string(),
  summary: z.string(),
  reason: z.string(),
  score: z.number().min(0).max(1),
});

export type OryaMatchPresentation = z.infer<
  typeof OryaMatchPresentationSchema
>;

export const OryaSelectionContextSchema = z.object({
  requesterId: z.string(),
  query: z.string(),
  matchSessionId: z.string(),
  options: z.array(OryaMatchPresentationSchema).min(1).max(5),
  constraints: OryaExtractionPayloadSchema.optional(),
});

export type OryaSelectionContext = z.infer<
  typeof OryaSelectionContextSchema
>;

export const OryaTurnResultSchema = z.object({
  reply: z.string(),
  language: z.enum(["FR", "EN"]),
  intent: OryaIntentSchema,
  action: z
    .enum([
      "chat_reply",
      "clarify",
      "present_matches",
      "create_match_request",
      "unsupported",
    ])
    .default("chat_reply"),
  extraction: OryaExtractionPayloadSchema.optional(),
  selectionContext: OryaSelectionContextSchema.optional(),
  matchSessionId: z.string().optional(),
});

export type OryaTurnResult = z.infer<typeof OryaTurnResultSchema>;
