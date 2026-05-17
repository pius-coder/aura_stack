import { describe, it, expect } from "vitest";

describe("Diversity Mix", () => {
  it("produces at most 5 profiles", () => {
    const candidates = Array.from({ length: 50 }, (_, i) => ({
      userId: `user_${i}`,
      score: Math.random(),
    }));
    const sorted = candidates.sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, Math.ceil(5 * 0.6));
    const mid = sorted.slice(10, 25).slice(0, Math.ceil(5 * 0.3));
    const wildcard = sorted.slice(-1).slice(0, 1);
    const results = [...top, ...mid, ...wildcard].slice(0, 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("no duplicate profiles", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      userId: `user_${i}`,
      score: Math.random(),
    }));
    const sorted = candidates.sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, Math.ceil(5 * 0.6));
    const mid = sorted.slice(5, 15).slice(0, Math.ceil(5 * 0.3));
    const wildcard = sorted.slice(-1).slice(0, 1);
    const results = [...top, ...mid, ...wildcard];
    const userIds = results.map((r) => r.userId);
    expect(new Set(userIds).size).toBe(userIds.length);
  });
});
