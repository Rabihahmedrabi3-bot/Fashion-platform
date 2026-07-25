import "../loadEnv.js";
import { runMigrations } from "./migrate.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set (see .env.example)");
}

await runMigrations(connectionString);
console.log("Migrations applied.");
