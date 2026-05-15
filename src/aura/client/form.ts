"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useForm,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormProps,
} from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { useAuraMutation, type UseAuraMutationOptions } from "./hooks";
import { AuraClientError } from "./transport";

export interface UseAuraFormOptions<
  TValues extends FieldValues,
  TData,
> extends Omit<UseFormProps<TValues>, "resolver"> {
  operationName: string;
  schema: z.ZodType<TValues, TValues>;
  mutation?: UseAuraMutationOptions<TValues, TData>;
}

export function useAuraForm<TValues extends FieldValues, TData = unknown>(
  options: UseAuraFormOptions<TValues, TData>,
) {
  const {
    operationName,
    schema,
    mutation: mutationOptions,
    ...formOptions
  } = options;
  const form = useForm<TValues>({
    ...formOptions,
    resolver: zodResolver(schema as never) as Resolver<TValues>,
  });

  const mutation = useAuraMutation<TValues, TData>(operationName, {
    ...mutationOptions,
    onError(error, variables, onMutateResult, context) {
      if (mutationOptions?.showBumps !== false) {
        if (error instanceof AuraClientError && error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
          applyServerFieldErrors(form.setError, error.fieldErrors);
        } else {
          toast.error(error.message || "Une erreur est survenue");
        }
      }
      mutationOptions?.onError?.(error, variables, onMutateResult, context);
    },
  });

  return {
    form,
    mutation,
    handleSubmit: form.handleSubmit((values) => mutation.mutate(values)),
    handleSubmitAsync: form.handleSubmit((values) =>
      mutation.mutateAsync(values),
    ),
  };
}

function applyServerFieldErrors<TValues extends FieldValues>(
  setError: ReturnType<typeof useForm<TValues>>["setError"],
  fieldErrors: Record<string, string[]>,
): void {
  for (const [field, messages] of Object.entries(fieldErrors)) {
    setError(field as Path<TValues>, {
      type: "server",
      message: messages.join("\n"),
    });
  }
}
