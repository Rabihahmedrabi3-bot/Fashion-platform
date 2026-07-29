import type { IntentParser, SearchFilters } from "../../src/lib/intentParser.js";

export class TestIntentParser implements IntentParser {
  calls: string[] = [];
  /** Set to a SearchFilters object to return it verbatim, or to "fail" to simulate an AI-side failure. */
  nextResponse: SearchFilters | "fail" = {};

  async parseSearchQuery(query: string): Promise<SearchFilters> {
    this.calls.push(query);
    if (this.nextResponse === "fail") return { keywords: query };
    return this.nextResponse;
  }
}
