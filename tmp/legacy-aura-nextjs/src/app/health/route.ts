import { NextResponse } from "next/server";
import { db } from "@/aura/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const body = {
    ok: dbOk,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    services: { database: dbOk },
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
