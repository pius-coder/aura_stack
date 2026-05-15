import { NextResponse, type NextRequest } from "next/server";
import { runAuraCron } from "@/aura/server/cron";
import { v4 as uuidv4 } from "uuid";

function jsonError(args: { code: string; message: string; status: number }) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: args.code,
        message: args.message,
        status: args.status,
        requestId: uuidv4(),
      },
    },
    { status: args.status },
  );
}

function verifyInternalSecret(request: NextRequest): boolean {
  const secret = process.env.AURA_INTERNAL_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-aura-internal-secret");
  return header === secret;
}

export async function POST(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return jsonError({
      code: "FORBIDDEN",
      message: "Secret interne invalide.",
      status: 403,
    });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || !payload.jobName) {
    return jsonError({
      code: "BAD_REQUEST",
      message: "jobName requis.",
      status: 400,
    });
  }

  const result = await runAuraCron(payload.jobName);

  return NextResponse.json(
    {
      ok: result.status === "succeeded",
      result,
    },
    { status: result.status === "succeeded" ? 200 : 500 },
  );
}
