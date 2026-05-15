

import { z } from "zod";
import type { AuraContext } from "./context";
import { AuraError } from "@/aura/core/errors";

export type NotificationHandler<TPayload> = (args: {
  ctx: AuraContext;
  payload: TPayload;
}) => Promise<void> | void;

export interface AuraNotificationDefinition<TPayload = unknown> {
  readonly __auraNotification: true;
  readonly name: string;
  readonly payloadSchema: z.ZodType<TPayload>;
  readonly handler: NotificationHandler<TPayload>;
}

const notificationRegistry = new Map<string, AuraNotificationDefinition<unknown>>();

interface NotificationBuilder<TPayload = unknown> {
  payload<TSchema extends z.ZodType>(
    schema: TSchema,
  ): NotificationBuilder<z.infer<TSchema>>;
  handler(
    fn: NotificationHandler<TPayload>,
  ): AuraNotificationDefinition<TPayload>;
}

function makeNotificationBuilder<TPayload = unknown>(
  name: string,
  existingState?: { name: string; payloadSchema: z.ZodType | null },
): NotificationBuilder<TPayload> {
  const state = existingState ?? {
    name,
    payloadSchema: null as z.ZodType | null,
  };

  return {
    payload<TSchema extends z.ZodType>(schema: TSchema) {
      state.payloadSchema = schema;
      return makeNotificationBuilder<z.infer<TSchema>>(name, state);
    },
    handler(fn: NotificationHandler<TPayload>) {
      if (!state.payloadSchema) {
        throw new Error(
          `[aura] Notification "${name}" is missing .payload(schema).`,
        );
      }

      const definition: AuraNotificationDefinition<TPayload> = {
        __auraNotification: true,
        name: state.name,
        payloadSchema: state.payloadSchema as z.ZodType<TPayload>,
        handler: fn,
      };

      notificationRegistry.set(state.name, definition as AuraNotificationDefinition<unknown>);
      return definition;
    },
  };
}

export function defineNotificationFn<TPayload = unknown>(
  name: string,
): NotificationBuilder<TPayload> {
  return makeNotificationBuilder<TPayload>(name);
}

export interface NotificationDispatcher {
  via(name: string): {
    send(payload: unknown): Promise<void>;
  };
}

export function createNotificationDispatcher(ctxFactory: () => AuraContext): NotificationDispatcher {
  return {
    via(name: string) {
      return {
        async send(payload: unknown) {
          const definition = notificationRegistry.get(name);
          if (!definition) {
            throw new AuraError("INTERNAL_ERROR", `Notification Aura non definie: ${name}`, {
              expose: process.env.NODE_ENV !== "production",
            });
          }

          const parsed = definition.payloadSchema.safeParse(payload);
          if (!parsed.success) {
            throw new AuraError("VALIDATION_ERROR", `Payload de notification invalide: ${name}`);
          }

          await definition.handler({ ctx: ctxFactory(), payload: parsed.data });
        },
      };
    },
  };
}

export function hasNotification(name: string): boolean {
  return notificationRegistry.has(name);
}
