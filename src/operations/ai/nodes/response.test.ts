import { describe, expect, it } from "vitest";
import { checkPersonaCompliance } from "./response";

describe("checkPersonaCompliance", () => {
  it("accepts a formal compliant reply", () => {
    expect(
      checkPersonaCompliance(
        "Bonjour. Je peux vous aider a trouver un prestataire a Douala.",
      ),
    ).toBe(true);
  });

  it("rejects tutoiement and slang", () => {
    expect(checkPersonaCompliance("Salut, tu peux me dire quoi faire ?")).toBe(
      false,
    );
  });

  it("rejects phone and email leakage", () => {
    expect(
      checkPersonaCompliance(
        "Contactez-le au +237612345678 ou ecrivez a test@example.com.",
      ),
    ).toBe(false);
  });

  it("rejects emoji-heavy replies", () => {
    expect(checkPersonaCompliance("Je suis ravi de vous aider 😀😀")).toBe(
      false,
    );
  });
});
