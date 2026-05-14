import { csrfCookieName } from "./cookies";

const textEncoder = new TextEncoder();

function csrfSecret(): string {
  const provided =
    process.env.AURA_CSRF_SECRET ||
    process.env.AURA_INTERNAL_SECRET;

  if (provided) return provided;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[aura] AURA_CSRF_SECRET (or AURA_INTERNAL_SECRET) is required in production.",
    );
  }
  return "aura-dev-csrf-secret";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(csrfSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(value),
  );
  return base64Url(new Uint8Array(signature));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createCsrfToken(): Promise<string> {
  const nonce = randomBase64Url(24);
  return `${nonce}.${await sign(nonce)}`;
}

export async function verifyCsrfToken(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  const [nonce, signature] = token.split(".");
  if (!nonce || !signature) return false;
  return safeEqual(await sign(nonce), signature);
}

export function csrfHeaderName(): string {
  return "x-aura-csrf";
}

export function getCsrfCookieName(): string {
  return csrfCookieName();
}

export function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
