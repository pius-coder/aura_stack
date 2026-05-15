/**
 * `defineHttpAction` — webhook / callback handler that bypasses the JSON
 * envelope contract.
 *
 * Resolves: Requirements 21.1, 21.3, 21.4, 21.5 (Decision 15).
 *
 * Use cases: third-party webhooks (Stripe, Twilio, SendGrid), OAuth
 * callbacks, raw file uploads, or any endpoint where the caller is not
 * an Aura client and cannot speak the bridge protocol.
 *
 * HTTP actions:
 *   - receive the raw `Request` and return a raw `Response`
 *   - default to `csrf(false)` — webhooks live behind shared-secret HMAC
 *   - share the same `AuraContext` shape as operations (auth, db, log,
 *     audit, scheduler, storage, …)
 */

import type { AuraContext, AuraSource } from "./context";
import { createAuraContext } from "./create-context";
import { AuraError } from "@/aura/core/errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type HttpAccess = "auth" | "public" | "internal";

export interface HttpActionDefinition {
  readonly __auraHttpAction: true;
  readonly path: string;
  readonly method: HttpMethod;
  readonly access: HttpAccess;
  readonly csrf: boolean;
  readonly handler: (ctx: AuraContext, request: Request) => Promise<Response> | Response;
}

const httpActionRegistry: HttpActionDefinition[] = [];

export function listHttpActions(): readonly HttpActionDefinition[] {
  return httpActionRegistry;
}

interface FinalStage {
  handler(
    fn: (ctx: AuraContext, request: Request) => Promise<Response> | Response,
  ): HttpActionDefinition;
}

interface AccessStage extends FinalStage {
  csrf(enabled: boolean): AccessStage;
}

interface RootStage {
  auth(): AccessStage;
  public(): AccessStage;
  internal(): AccessStage;
}

export function defineHttpAction(path: string, method: HttpMethod): RootStage {
  const state: {
    path: string;
    method: HttpMethod;
    access: HttpAccess | null;
    csrf: boolean;
  } = { path, method, access: null, csrf: false };

  function makeFinal(): AccessStage {
    return {
      csrf(enabled: boolean) {
        state.csrf = enabled;
        return makeFinal();
      },
      handler(fn) {
        if (!state.access) {
          throw new Error(
            `[aura] HTTP action ${state.method} ${state.path} is missing .auth() / .public() / .internal()`,
          );
        }
        const definition: HttpActionDefinition = {
          __auraHttpAction: true,
          path: state.path,
          method: state.method,
          access: state.access,
          csrf: state.csrf,
          handler: fn,
        };
        httpActionRegistry.push(definition);
        return definition;
      },
    };
  }

  return {
    auth() {
      state.access = "auth";
      return makeFinal();
    },
    public() {
      state.access = "public";
      return makeFinal();
    },
    internal() {
      state.access = "internal";
      return makeFinal();
    },
  };
}

/**
 * Execute a registered HTTP action with a freshly created Aura context.
 * Used by the Hono `/aura-http/*` mount in `routes/http-actions.ts`.
 */
export async function runHttpAction(
  definition: HttpActionDefinition,
  request: Request,
  source: AuraSource = "bridge",
): Promise<Response> {
  const ctx = await createAuraContext({ request, source });

  if (definition.access === "auth" && !ctx.session) {
    throw new AuraError("UNAUTHORIZED", "Authentification requise.");
  }
  if (definition.access === "internal") {
    const secretHeader = request.headers.get("x-aura-internal-secret");
    const expected = process.env.AURA_INTERNAL_SECRET;
    if (!expected || !secretHeader || secretHeader !== expected) {
      throw new AuraError("FORBIDDEN", "Endpoint interne.");
    }
  }

  return definition.handler(ctx, request);
}
