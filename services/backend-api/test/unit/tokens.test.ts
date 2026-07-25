import { describe, expect, it } from "vitest";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
  verifyAccessToken,
} from "../../src/lib/tokens.js";

describe("access tokens", () => {
  it("round-trips subject and tokenVersion through sign/verify", async () => {
    const token = await signAccessToken({ sub: "user-1", tokenVersion: 3 }, "secret");
    const payload = await verifyAccessToken(token, "secret");
    expect(payload).toEqual({ sub: "user-1", tokenVersion: 3 });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signAccessToken({ sub: "user-1", tokenVersion: 0 }, "secret-a");
    const payload = await verifyAccessToken(token, "secret-b");
    expect(payload).toBeNull();
  });

  it("rejects a garbage token", async () => {
    const payload = await verifyAccessToken("not-a-jwt", "secret");
    expect(payload).toBeNull();
  });
});

describe("opaque tokens", () => {
  it("generates high-entropy, unique tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("hashOpaqueToken is deterministic for the same token+pepper", () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token, "pepper")).toBe(hashOpaqueToken(token, "pepper"));
  });

  it("hashOpaqueToken differs across peppers", () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token, "pepper-a")).not.toBe(hashOpaqueToken(token, "pepper-b"));
  });
});
