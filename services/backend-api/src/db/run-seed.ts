import "../loadEnv.js";
import { seed } from "./seed.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set (see .env.example)");
}

const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

await seed(
  connectionString,
  bootstrapEmail && bootstrapPassword ? { email: bootstrapEmail, password: bootstrapPassword } : undefined,
);
console.log("Seed complete.");
