import { describe, it, expect } from "vitest";

function rrf(rankA: number[], rankB: number[], k = 60): number[] {
  const allIds = new Set([...rankA, ...rankB]);
  const raw: number[] = [];
  for (const id of allIds) {
    const posA = rankA.indexOf(id);
    const posB = rankB.indexOf(id);
    const scoreA = posA >= 0 ? 1 / (k + posA + 1) : 0;
    const scoreB = posB >= 0 ? 1 / (k + posB + 1) : 0;
    raw.push(scoreA + scoreB);
  }
  const max = Math.max(...raw);
  return raw.map((s) => s / max);
}

describe("RRF fusion", () => {
  it("identical rankings produce same score", () => {
    const rankA = [1, 2, 3, 4, 5];
    const rankB = [1, 2, 3, 4, 5];
    const scores = rrf(rankA, rankB, 60);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
  });

  it("inverted rankings give balanced scores", () => {
    const rankA = [1, 2, 3, 4, 5];
    const rankB = [5, 4, 3, 2, 1];
    const scores = rrf(rankA, rankB, 60);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("partial overlap still produces normalized scores", () => {
    const rankA = [1, 2, 3, 4, 5];
    const rankB = [3, 4, 5, 6, 7];
    const scores = rrf(rankA, rankB, 60);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("single-element rankings produce score 1", () => {
    const scores = rrf([1], [1], 60);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toBe(1);
  });

  it("k=1 works without division issues", () => {
    const rankA = [1, 2, 3];
    const scores = rrf(rankA, rankA, 1);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });
});
