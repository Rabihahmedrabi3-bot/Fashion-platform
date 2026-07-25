import { describe, expect, it } from "vitest";
import request from "supertest";
import { createServer } from "../src/server.js";

describe("GET /health", () => {
  it("returns 200 and status ok", async () => {
    const app = createServer();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
