import "./loadEnv.js";
import type { AppDependencies } from "./appDependencies.js";
import { createDatabase } from "./db/client.js";
import { AnthropicIntentParser } from "./lib/anthropicIntentParser.js";
import { DevConsoleEmailProvider } from "./lib/email.js";
import { R2ImageStorage } from "./lib/r2ImageStorage.js";
import { createServer } from "./server.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set (see .env.example)`);
  }
  return value;
}

const { db } = createDatabase(requireEnv("DATABASE_URL"));

const deps: AppDependencies = {
  db,
  emailProvider: new DevConsoleEmailProvider(),
  jwtAccessSecret: requireEnv("JWT_ACCESS_SECRET"),
  jwtCustomerAccessSecret: requireEnv("JWT_CUSTOMER_ACCESS_SECRET"),
  refreshTokenHashPepper: requireEnv("REFRESH_TOKEN_HASH_PEPPER"),
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "no-reply@platform.local",
  imageStorage: new R2ImageStorage({
    accountId: requireEnv("R2_ACCOUNT_ID"),
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucketName: requireEnv("R2_BUCKET_NAME"),
    publicBaseUrl: requireEnv("R2_PUBLIC_BASE_URL"),
  }),
  intentParser: new AnthropicIntentParser(requireEnv("ANTHROPIC_API_KEY")),
};

const port = Number(process.env.PORT ?? 4000);
const app = createServer(deps);

app.listen(port, () => {
  console.log(`backend-api listening on port ${port}`);
});
