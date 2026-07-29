import Anthropic from "@anthropic-ai/sdk";
import type { IntentParser, SearchFilters } from "./intentParser.js";

const TOOL_NAME = "extract_search_filters";

const FILTER_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Extract structured fashion catalog search filters from a customer's natural-language query. " +
    "Only include a field if the query genuinely implies it - leave fields out rather than guessing.",
  input_schema: {
    type: "object",
    properties: {
      subcategory: { type: "string", description: "Garment type, e.g. 'dress', 'shoes', 'jacket'" },
      gender: { type: "string", description: "e.g. 'women', 'men', 'unisex'" },
      style: { type: "string", description: "e.g. 'casual', 'formal', 'streetwear'" },
      occasion: { type: "string", description: "e.g. 'wedding', 'work', 'party'" },
      season: { type: "string", description: "e.g. 'summer', 'winter'" },
      fit: { type: "string", description: "e.g. 'slim', 'loose', 'regular'" },
      material: { type: "string", description: "e.g. 'cotton', 'leather', 'silk'" },
      color: { type: "string", description: "e.g. 'green', 'black', 'red'" },
      size: { type: "string", description: "e.g. 'S', 'M', 'L', 'XL', '42'" },
      brand: { type: "string" },
      minPriceCents: { type: "integer", description: "Lower price bound in cents, if the query mentions a price floor" },
      maxPriceCents: { type: "integer", description: "Upper price bound in cents, if the query mentions a price ceiling (e.g. 'under $50' -> 5000)" },
      keywords: { type: "string", description: "Any remaining descriptive words not captured by the fields above" },
    },
  },
};

/**
 * Real implementation for production. Only ever translates a query into
 * filters that get run through a normal SQL query in publicMarketplaceRepo -
 * it never generates results itself. Degrades to a plain keyword search on
 * any failure rather than erroring the whole request.
 */
export class AnthropicIntentParser implements IntentParser {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async parseSearchQuery(query: string): Promise<SearchFilters> {
    try {
      const response = await this.client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        tools: [FILTER_TOOL],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [{ role: "user", content: query }],
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      if (!toolUse) return { keywords: query };
      return toolUse.input as SearchFilters;
    } catch {
      return { keywords: query };
    }
  }
}
