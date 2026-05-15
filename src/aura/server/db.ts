

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("[aura] DATABASE_URL is required to initialize Prisma.");
}

const globalForPrisma = globalThis as unknown as {
  auraPrisma?: PrismaClient;
};

const adapter = new PrismaPg({ connectionString });

export const db =
  globalForPrisma.auraPrisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.auraPrisma = db;
}

export type AuraDb = typeof db;
