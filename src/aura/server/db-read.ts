/**
 * `defineDbReadFn` — typed wrapper for hand-written, optimized read
 * queries (raw SQL, Prisma views, materialized views).
 *
 * Resolves: Requirement 4.1, 4.2, 4.3 (Decision 7).
 *
 * Use this when a query needs hand-tuned SQL (`$queryRaw`) or hits a
 * dedicated DB view that Prisma's generated `findMany` cannot express.
 * Output is validated against a Zod schema so the contract is checked
 * even when the underlying view changes shape.
 */

import type { z } from "zod";
import { db } from "./db";
import type { AuraDb } from "./db";
import { AuraError } from "@/aura/core/errors";

export interface DbReadFn<TInput, TOutput> {
  readonly __auraDbRead: true;
  readonly name: string;
  (input: TInput): Promise<TOutput>;
}

export interface DefineDbReadFnArgs<TInputSchema extends z.ZodType, TOutputSchema extends z.ZodType> {
  name: string;
  input: TInputSchema;
  output: TOutputSchema;
  execute(args: { db: AuraDb; input: z.infer<TInputSchema> }): Promise<unknown>;
}

export function defineDbReadFn<
  TInputSchema extends z.ZodType,
  TOutputSchema extends z.ZodType,
>(
  args: DefineDbReadFnArgs<TInputSchema, TOutputSchema>,
): DbReadFn<z.infer<TInputSchema>, z.infer<TOutputSchema>> {
  type TInput = z.infer<TInputSchema>;
  type TOutput = z.infer<TOutputSchema>;

  const fn = (async (input: TInput): Promise<TOutput> => {
    const parsedInput = args.input.safeParse(input);
    if (!parsedInput.success) {
      throw new AuraError("VALIDATION_ERROR", `Input invalide pour ${args.name}`);
    }
    const raw = await args.execute({ db, input: parsedInput.data });
    const parsedOutput = args.output.safeParse(raw);
    if (!parsedOutput.success) {
      throw new AuraError(
        "INTERNAL_ERROR",
        `Sortie invalide pour ${args.name}: la vue retourne une forme inattendue.`,
      );
    }
    return parsedOutput.data as TOutput;
  }) as DbReadFn<TInput, TOutput>;

  Object.assign(fn, { __auraDbRead: true as const, name: args.name });
  return fn;
}
