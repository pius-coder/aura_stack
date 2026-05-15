import { NextResponse, type NextRequest } from "next/server";
import { getClientOperationManifest, getOperation } from "@/aura.registry";
import { runAuraOperation } from "@/aura/server/runner";
import { v4 as uuidv4 } from "uuid";

type AuraRouteContext = {
  params: Promise<{ aura?: string[] }>;
};

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

function applyCookies(
  response: NextResponse,
  cookies: Awaited<ReturnType<typeof runAuraOperation>>["cookies"],
): NextResponse {
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

async function handlePost(request: NextRequest, context: AuraRouteContext) {
  const { aura = [] } = await context.params;
  const operationName = aura.join(".");

  if (!operationName) {
    return jsonError({
      code: "NOT_FOUND",
      message: "Opération Aura manquante.",
      status: 404,
    });
  }

  const operation = getOperation(operationName);
  if (!operation) {
    return jsonError({
      code: "NOT_FOUND",
      message: `Opération Aura introuvable: ${operationName}`,
      status: 404,
    });
  }

  if (operation.type !== "mutate" && operation.type !== "query") {
    return jsonError({
      code: "BAD_REQUEST",
      message: "Type d’opération Aura invalide.",
      status: 400,
    });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError({
      code: "BAD_REQUEST",
      message: "Content-Type application/json requis.",
      status: 400,
    });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonError({
      code: "BAD_REQUEST",
      message: "Payload JSON Aura invalide.",
      status: 400,
    });
  }

  const result = await runAuraOperation({
    operationName,
    input: "input" in payload ? payload.input : undefined,
    params: "params" in payload ? payload.params : undefined,
    request,
    source: "bridge",
  });

  return applyCookies(
    NextResponse.json(result.envelope, { status: result.status }),
    result.cookies,
  );
}

export async function POST(request: NextRequest, context: AuraRouteContext) {
  try {
    return await handlePost(request, context);
  } catch (error) {
    console.error("[aura] Bridge POST error:", error);
    return jsonError({
      code: "INTERNAL_ERROR",
      message: "Erreur interne du serveur.",
      status: 500,
    });
  }
}

export async function GET(_request: NextRequest, context: AuraRouteContext) {
  const { aura = [] } = await context.params;
  if (aura.join(".") === "_manifest") {
    return NextResponse.json(getClientOperationManifest(), { status: 200 });
  }

  return jsonError({
    code: "METHOD_NOT_ALLOWED",
    message:
      "Les opérations Aura passent par POST. GET est réservé au manifeste client.",
    status: 405,
  });
}
