import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: "./test/globalSetup.ts",
    setupFiles: ["./test/helpers/loadEnv.ts", "./test/helpers/resetDb.setup.ts"],
    // Tests share one Postgres database via truncation between tests, so files must not run concurrently.
    fileParallelism: false,
  },
});
