"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useForm,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormProps,
} from "react-hook-form";
import type { z } from "zod";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useAuraMutation, type UseAuraMutationOptions } from "./hooks";
import { AuraClientError } from "./transport";

interface StepperStoreState<TData extends FieldValues> {
  step: number;
  values: Partial<TData>;
  completedSteps: number[];
  setStep: (step: number) => void;
  setValues: (values: Partial<TData>) => void;
  markStepCompleted: (step: number) => void;
  reset: () => void;
}

function createStepperStore<TData extends FieldValues>(key: string) {
  return create<StepperStoreState<TData>>()(persist((set) => ({
    step: 0,
    values: {} as Partial<TData>,
    completedSteps: [],
    setStep: (step) => set({ step }),
    setValues: (values) => set((state) => ({ values: { ...state.values, ...values } })),
    markStepCompleted: (step) => set((state) => ({
      completedSteps: state.completedSteps.includes(step)
        ? state.completedSteps
        : [...state.completedSteps, step],
    })),
    reset: () => set({ step: 0, values: {} as Partial<TData>, completedSteps: [] }),
  }), {
    name: `aura-stepper-${key}`,
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  }));
}

export interface UseStepperFormOptions<
  TValues extends FieldValues,
  TData,
> {
  operationName: string;
  stepperKey: string;
  steps: Array<{
    name: string;
    schema: z.ZodType<TValues, TValues>;
    defaultValues?: Partial<TValues>;
  }>;
  mutation?: UseAuraMutationOptions<TValues, TData>;
}

export function useStepperForm<
  TValues extends FieldValues,
  TData = unknown,
>(options: UseStepperFormOptions<TValues, TData>) {
  const { operationName, stepperKey, steps, mutation: mutationOptions } = options;
  const storeRef = useRef(createStepperStore<TValues>(stepperKey));
  const store = storeRef.current();
  const [hydrated, setHydrated] = useState(false);

  // Hydrate persisted state on mount (client only).
  useEffect(() => {
    void storeRef.current.persist.rehydrate();
    setHydrated(true);
  }, []);

  const currentStep = store.step;
  const currentStepDef = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  const form = useForm<TValues>({
    resolver: currentStepDef
      ? (zodResolver(currentStepDef.schema as never) as Resolver<TValues>)
      : undefined,
    defaultValues: {
      ...(currentStepDef?.defaultValues ?? {}),
      ...(store.values ?? {}),
    } as UseFormProps<TValues>["defaultValues"],
  });

  const mutation = useAuraMutation<TValues, TData>(operationName, {
    ...mutationOptions,
    onError(error, variables, onMutateResult, context) {
      if (error instanceof AuraClientError && error.fieldErrors) {
        applyServerFieldErrors(form.setError, error.fieldErrors);
      }
      mutationOptions?.onError?.(error, variables, onMutateResult, context);
    },
  });

  const goToStep = useCallback(
    (step: number) => {
      if (step < 0 || step >= steps.length) return;
      store.setStep(step);
    },
    [store, steps.length],
  );

  const nextStep = useCallback(
    async (values: TValues) => {
      store.setValues(values as Partial<TValues>);
      store.markStepCompleted(currentStep);

      if (isLastStep) {
        const allValues = { ...store.values, ...values } as TValues;
        mutation.mutate(allValues);
        return;
      }

      store.setStep(currentStep + 1);
    },
    [store, currentStep, isLastStep, mutation],
  );

  const prevStep = useCallback(() => {
    if (currentStep > 0) store.setStep(currentStep - 1);
  }, [store, currentStep]);

  const reset = useCallback(() => {
    store.reset();
    form.reset();
    mutation.reset();
  }, [store, form, mutation]);

  // Hydration guard: ensure localStorage has been read before rendering
  // to avoid hydration mismatch between server and client.
  const isHydrated = typeof window !== "undefined" && hydrated;

  return {
    form,
    mutation,
    step: currentStep,
    steps,
    isLastStep,
    isFirstStep: currentStep === 0,
    completedSteps: store.completedSteps,
    goToStep,
    nextStep,
    prevStep,
    reset,
    handleSubmit: form.handleSubmit(nextStep),
    hydrated: isHydrated,
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
