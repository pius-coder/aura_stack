import { AuraError, type AuraFieldErrors } from "./errors";

export type AuraBumpVariant = "success" | "info" | "warning" | "error";

export interface AuraBump {
  variant: AuraBumpVariant;
  title: string;
  description?: string;
}

export interface AuraSuccessEnvelope<TData> {
  ok: true;
  data: TData;
  meta: {
    requestId: string;
    bumps: AuraBump[];
    invalidates: string[];
    refresh: boolean;
  };
}

export interface AuraErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    status: number;
    fieldErrors?: AuraFieldErrors;
    requestId: string;
  };
}

export type AuraEnvelope<TData> = AuraSuccessEnvelope<TData> | AuraErrorEnvelope;

export function successEnvelope<TData>(args: {
  data: TData;
  requestId: string;
  bumps: AuraBump[];
  invalidates: string[];
  refresh: boolean;
}): AuraSuccessEnvelope<TData> {
  return {
    ok: true,
    data: args.data,
    meta: {
      requestId: args.requestId,
      bumps: args.bumps,
      invalidates: args.invalidates,
      refresh: args.refresh,
    },
  };
}

export function errorEnvelope(args: {
  error: AuraError;
  requestId: string;
}): AuraErrorEnvelope {
  return {
    ok: false,
    error: {
      code: args.error.code,
      message: args.error.expose ? args.error.message : "Une erreur interne est survenue.",
      status: args.error.status,
      fieldErrors: args.error.fieldErrors,
      requestId: args.requestId,
    },
  };
}
