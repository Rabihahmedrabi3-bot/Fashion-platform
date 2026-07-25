import type { Database } from "./db/client.js";
import type { EmailProvider } from "./lib/email.js";

export interface AppDependencies {
  db: Database;
  emailProvider: EmailProvider;
  jwtAccessSecret: string;
  refreshTokenHashPepper: string;
  emailFromAddress: string;
  /** Used to build absolute URLs for locally-stored uploads (see routes/products.ts image upload). */
  publicApiBaseUrl: string;
  /** Absolute path to the directory uploaded product images are written to and served from. */
  uploadsDir: string;
}
