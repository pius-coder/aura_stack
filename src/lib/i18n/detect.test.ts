import { describe, it, expect } from "vitest";
import { detectLanguage } from "./detect";

describe("detectLanguage", () => {
  it("detects French from common phrases", () => {
    expect(detectLanguage("Bonjour, je cherche un plombier à Douala")).toBe("FR");
    expect(detectLanguage("Je veux trouver quelqu'un pour m'aider")).toBe("FR");
    expect(detectLanguage("Merci beaucoup pour votre aide")).toBe("FR");
  });

  it("detects English from common phrases", () => {
    expect(detectLanguage("Hello, I'm looking for a plumber")).toBe("EN");
    expect(detectLanguage("I need help finding someone")).toBe("EN");
    expect(detectLanguage("Thanks for your help")).toBe("EN");
  });

  it("returns UNKNOWN for ambiguous short input", () => {
    expect(detectLanguage("ok")).toBe("UNKNOWN");
  });

  it("respects custom threshold", () => {
    expect(detectLanguage("hello bonjour", 0.9)).toBe("UNKNOWN");
  });
});
