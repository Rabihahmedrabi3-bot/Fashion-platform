import type { RankableProduct, ResultRanker } from "../../src/lib/resultRanker.js";

export class TestResultRanker implements ResultRanker {
  calls: { query: string; candidateIds: string[] }[] = [];
  /** Set to an ordered id list to return it verbatim, or to "fail" to simulate the real ranker's own degrade-to-original-order behavior. */
  nextOrder: string[] | "fail" = [];

  async rank(query: string, candidates: RankableProduct[]): Promise<string[]> {
    this.calls.push({ query, candidateIds: candidates.map((c) => c.id) });
    if (this.nextOrder === "fail") return candidates.map((c) => c.id);
    return this.nextOrder;
  }
}
