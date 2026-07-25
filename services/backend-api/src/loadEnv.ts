import { existsSync } from "node:fs";
import path from "node:path";

/** Node has no automatic .env loading; CLI entrypoints import this first to load one if present. */
const envPath = path.resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
