export const featureFlags = {
  paymentsEnabled: process.env.PAYMENTS_ENABLED === "true",
  voiceAuthEnabled: false,
  knowledgeGraphHybridEnabled:
    process.env.KNOWLEDGE_GRAPH_HYBRID_ENABLED === "true",
} as const;
