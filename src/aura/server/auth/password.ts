

import bcrypt from "bcryptjs";
import { AuraError } from "@/aura/core/errors";

const BCRYPT_MAX_BYTES = 72;
const DUMMY_HASH = "$2b$10$i731sVZ8j3/EsfurkQbIEu8siFpkQ0VmveH3RxaJH.fhQ8GqxzV06";

export function validatePassword(password: string): void {
  const byteLength = Buffer.byteLength(password, "utf8");

  if (password.length < 8) {
    throw new AuraError("VALIDATION_ERROR", "Le mot de passe doit contenir au moins 8 caractères.", {
      fieldErrors: {
        password: ["Le mot de passe doit contenir au moins 8 caractères."],
      },
    });
  }

  if (byteLength > BCRYPT_MAX_BYTES) {
    throw new AuraError("VALIDATION_ERROR", "Le mot de passe est trop long pour bcrypt.", {
      fieldErrors: {
        password: ["Le mot de passe est trop long pour bcrypt."],
      },
    });
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const rounds = Number.parseInt(process.env.AURA_BCRYPT_ROUNDS || "12", 10);
  return bcrypt.hash(password, Number.isFinite(rounds) ? rounds : 12);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) {
    await bcrypt.compare("invalid-password-over-limit", hash || DUMMY_HASH);
    return false;
  }

  return bcrypt.compare(password, hash || DUMMY_HASH);
}
