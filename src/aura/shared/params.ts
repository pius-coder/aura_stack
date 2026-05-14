import type { z } from "zod";

export interface AuraParamsDefinition<TSchema extends z.ZodType> {
  readonly __auraParams: true;
  readonly schema: TSchema;
  readonly parsers: Record<string, unknown>;
}

export function defineAuraParams<TSchema extends z.ZodType>(args: {
  schema: TSchema;
  parsers: Record<string, unknown>;
}): AuraParamsDefinition<TSchema> {
  return {
    __auraParams: true,
    schema: args.schema,
    parsers: args.parsers,
  };
}
