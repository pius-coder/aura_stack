export type AuraErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CSRF_ERROR"
  | "INVALID_ORIGIN"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "INTERNAL_ERROR"
  | "BAD_REQUEST"
  | "METHOD_NOT_ALLOWED"
  | "BAD_RESPONSE";

export type AuraFieldErrors = Record<string, string[]>;

export class AuraError extends Error {
  readonly code: AuraErrorCode;
  readonly status: number;
  readonly fieldErrors?: AuraFieldErrors;
  readonly expose: boolean;

  constructor(
    code: AuraErrorCode,
    message: string,
    options: {
      status?: number;
      fieldErrors?: AuraFieldErrors;
      expose?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AuraError";
    this.code = code;
    this.status = options.status ?? statusFromCode(code);
    this.fieldErrors = options.fieldErrors;
    this.expose = options.expose ?? this.status < 500;
  }
}

export function statusFromCode(code: AuraErrorCode): number {
  switch (code) {
    case "VALIDATION_ERROR":
    case "BAD_REQUEST":
    case "OTP_INVALID":
    case "OTP_EXPIRED":
      return 400;
    case "UNAUTHORIZED":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
      return 401;
    case "FORBIDDEN":
    case "CSRF_ERROR":
    case "INVALID_ORIGIN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "METHOD_NOT_ALLOWED":
      return 405;
    case "INTERNAL_ERROR":
      return 500;
    default:
      return 500;
  }
}

export function toPublicAuraError(error: unknown): AuraError {
  if (error instanceof AuraError) return error;

  return new AuraError(
    "INTERNAL_ERROR",
    "Une erreur interne est survenue.",
    { status: 500, expose: false, cause: error },
  );
}
