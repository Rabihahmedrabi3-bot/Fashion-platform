import type { Database } from "./db/client.js";
import type { EmailProvider } from "./lib/email.js";
import type { ImageStorage } from "./lib/imageStorage.js";
import type { IntentParser } from "./lib/intentParser.js";
import type { ResultRanker } from "./lib/resultRanker.js";

export interface AppDependencies {
  db: Database;
  emailProvider: EmailProvider;
  jwtAccessSecret: string;
  /** Separate from jwtAccessSecret so a customer token can never be replayed against staff/admin endpoints, or vice versa. */
  jwtCustomerAccessSecret: string;
  refreshTokenHashPepper: string;
  emailFromAddress: string;
  /** Where uploaded images (product photos, store logo, theme hero image) are stored. */
  imageStorage: ImageStorage;
  /** Translates a natural-language marketplace search query into structured catalog filters. */
  intentParser: IntentParser;
  /** Judges genuine relevance of already-filtered marketplace candidates against the original query. */
  resultRanker: ResultRanker;
}
