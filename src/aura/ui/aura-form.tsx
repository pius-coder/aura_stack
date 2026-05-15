/**
 * `<AuraForm>` — auto-generated form from Zod schema, wired to useAuraMutation.
 * Resolves: Requirement 38.3.
 *
 * Uses shadcn Input, Textarea, Select, Checkbox, Button primitives.
 */

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { OperationRef } from "@/aura/core/types";
import { useAuraMutation } from "@/aura/client/hooks";
import { Input } from "@/aura/ui/input";
import { Textarea } from "@/aura/ui/textarea";
import { Button } from "@/aura/ui/button";
import { Label } from "@/aura/ui/label";
import { Checkbox } from "@/aura/ui/checkbox";

export interface AuraFormField {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "password" | "select" | "textarea" | "file" | "date" | "checkbox";
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
}

export interface AuraFormProps<T = unknown> {
  mutation: OperationRef | string;
  schema?: z.ZodType;
  fields: AuraFormField[];
  onSuccess?: (data: T) => void;
  onError?: (error: unknown) => void;
  submitLabel?: string;
  className?: string;
  defaultValues?: Record<string, unknown>;
}

export function AuraForm<T = unknown>({
  mutation,
  schema,
  fields,
  onSuccess,
  onError,
  submitLabel = "Envoyer",
  className,
  defaultValues,
}: AuraFormProps<T>) {
  const form = useForm({
    resolver: schema ? (zodResolver(schema as never) as Resolver) : undefined,
    defaultValues: defaultValues as Record<string, unknown>,
  });

  const { mutate, isPending } = useAuraMutation<unknown, T>(
    typeof mutation === "string" ? mutation : mutation._name,
    {
      onSuccess: (data) => onSuccess?.(data as T),
      onError,
    },
  );

  const onSubmit = form.handleSubmit((data) => {
    mutate(data);
  });

  return (
    <form onSubmit={onSubmit} className={className}>
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {field.type === "textarea" ? (
              <Textarea
                id={field.name}
                placeholder={field.placeholder}
                {...form.register(field.name)}
              />
            ) : field.type === "select" ? (
              <select
                id={field.name}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-7 w-full rounded-md border px-2 py-0.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                {...form.register(field.name)}
              >
                <option value="">{field.placeholder ?? "Sélectionner..."}</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <Checkbox id={field.name} {...form.register(field.name)} />
            ) : (
              <Input
                id={field.name}
                type={field.type ?? "text"}
                placeholder={field.placeholder}
                {...form.register(field.name)}
              />
            )}

            {form.formState.errors[field.name] && (
              <p className="text-destructive text-xs">
                {form.formState.errors[field.name]?.message as string}
              </p>
            )}
          </div>
        ))}
      </div>

      <Button type="submit" disabled={isPending} className="mt-6 w-full">
        {isPending ? "..." : submitLabel}
      </Button>
    </form>
  );
}
