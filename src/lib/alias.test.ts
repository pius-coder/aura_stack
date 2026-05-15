import { describe, it, expect } from "vitest";
import { generateAlias } from "./alias";

describe("generateAlias", () => {
  it("returns a string with three parts separated by dashes", () => {
    const alias = generateAlias("FR");
    const parts = alias.split("-");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
    expect(parts[2]).toMatch(/^\d{4}$/);
  });

  it("generates EN format without errors", () => {
    const alias = generateAlias("EN");
    expect(alias.split("-")).toHaveLength(3);
  });

  it("generates unique values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(generateAlias("FR"));
    }
    expect(seen.size).toBeGreaterThan(90);
  });
});
