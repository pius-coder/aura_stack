"use client";

import { useQueryStates, type UseQueryStatesKeysMap } from "nuqs";
import type { z } from "zod";
import type { AuraParamsDefinition } from "@/aura/shared/params";

export function useAuraParams<TSchema extends z.ZodType>(
  definition: AuraParamsDefinition<TSchema>,
) {
  const [state, setState] = useQueryStates(
    definition.parsers as UseQueryStatesKeysMap<z.infer<TSchema>>,
  );

  const validated = definition.schema.safeParse(state);
  const params = validated.success ? validated.data : (definition.schema.parse({}) as z.infer<TSchema>);

  return [params, setState] as const;
}
