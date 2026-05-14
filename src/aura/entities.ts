/**
 * Aura Entities — Auto-re-exports all Prisma model types and enums.
 * 
 * Import from "@/aura/entities" instead of "@/generated/prisma" to keep
 * the Aura layer abstract and allow future changes to the ORM.
 * 
 * This file automatically re-exports everything from the Prisma client,
 * so new models/enums are available without manual updates.
 * 
 * @example
 * import type { Product, Category, Country } from "@/aura/entities";
 * import { RequestStatus, TransportMode } from "@/aura/entities";
 */

// Re-export everything from Prisma client (types, enums, etc.)
export * from "@/generated/prisma/client";
