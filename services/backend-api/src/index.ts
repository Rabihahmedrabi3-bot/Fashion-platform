import "./loadEnv.js";
import path from "node:path";
import type { AppDependencies } from "./appDependencies.js";
import { createDatabase } from "./db/client.js";
import { DevConsoleEmailProvider } from "./lib/email.js";
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
  refreshTokenHashPepper: requireEnv("REFRESH_TOKEN_HASH_PEPPER"),
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "no-reply@platform.local",
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  uploadsDir: path.resolve(process.cwd(), "uploads"),
};

const port = Number(process.env.PORT ?? 4000);
const app = createServer(deps);

app.listen(port, () => {
  console.log(`backend-api listening on port ${port}`);
});
