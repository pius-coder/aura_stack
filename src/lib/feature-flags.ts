export type BusinessPhase = "mvp" | "freemium" | "commission";

function getBusinessPhase(): BusinessPhase {
  return (process.env.BUSINESS_PHASE as BusinessPhase) ?? "mvp";
}

export const featureFlags = {
  paymentsEnabled: process.env.PAYMENTS_ENABLED === "true",
  voiceAuthEnabled: false,
  knowledgeGraphHybridEnabled: process.env.KNOWLEDGE_GRAPH_HYBRID_ENABLED === "true",
  get businessPhase() { return getBusinessPhase(); },
  get isMvp() { return getBusinessPhase() === "mvp"; },
  get isFreemium() { return getBusinessPhase() === "freemium"; },
  get isCommission() { return getBusinessPhase() === "commission"; },
} as const;
