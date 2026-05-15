

import type { z } from "zod";
import { createSearchParamsCache } from "nuqs/server";
import type { AuraParamsDefinition } from "@/aura/shared/params";

export async function loadAuraParams<TSchema extends z.ZodType>(
  definition: AuraParamsDefinition<TSchema>,
  searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>,
): Promise<z.infer<TSchema>> {
  const cache = createSearchParamsCache(definition.parsers as Parameters<typeof createSearchParamsCache>[0]);
  const resolved = await searchParams;
  const parsed = cache.parse(resolved);
  return definition.schema.parse(parsed);
}
