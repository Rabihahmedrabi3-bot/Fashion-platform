import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { registerVerifiedUser, uniquePhone, uniqueSlug } from "../helpers/fixtures.js";

describe("auth", () => {
  it("registers, verifies email, logs in, refreshes, and logs out - full cycle", async () => {
    const { app, emailProvider } = buildTestApp();
    const email = `${uniqueSlug("cycle")}@example.com`;
    const password = "correct-horse-battery-staple";

    const registerRes = await request(app)
      .post("/auth/register")
      .send({ email, password, fullName: "Cycle User" });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.status).toBe("pending_verification");

    // Unverified user cannot log in.
    const earlyLogin = await request(app).post("/auth/login").send({ email, password });
    expect(earlyLogin.status).toBe(401);

    const token = emailProvider.lastToken(email);
    const verifyRes = await request(app).post("/auth/verify-email").send({ token });
    expect(verifyRes.status).toBe(200);

    const loginRes = await request(app).post("/auth/login").send({ email, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty("accessToken");
    expect(loginRes.body).toHaveProperty("refreshToken");

    const meRes = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(email);

    const refreshRes = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: loginRes.body.refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.refreshToken).not.toBe(loginRes.body.refreshToken);

    // The rotated-out refresh token is now dead.
    const reuseOldRefresh = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: loginRes.body.refreshToken });
    expect(reuseOldRefresh.status).toBe(401);

    const logoutRes = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${refreshRes.body.accessToken}`)
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshAfterLogout = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("rejects registering a duplicate email with 409, not 500", async () => {
    const { app, emailProvider } = buildTestApp();
    const user = await registerVerifiedUser(app, emailProvider);

    const res = await request(app)
      .post("/auth/register")
      .send({ email: user.email, password: "another-password-123", fullName: "Someone Else" });
    expect(res.status).toBe(409);
  });

  it("rejects a malformed register payload with 422 and field-level errors", async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "not-an-email", password: "short", fullName: "" });

    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.fields)).toBe(true);
    expect(res.body.fields.length).toBeGreaterThan(0);
  });

  it("rejects an invalid verification token with 410", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/auth/verify-email").send({ token: "does-not-exist" });
    expect(res.status).toBe(410);
  });

  it("request-password-reset always returns 200, regardless of whether the email exists", async () => {
    const { app, emailProvider } = buildTestApp();
    const user = await registerVerifiedUser(app, emailProvider);

    const existing = await request(app).post("/auth/request-password-reset").send({ email: user.email });
    expect(existing.status).toBe(200);

    const nonexistent = await request(app)
      .post("/auth/request-password-reset")
      .send({ email: "nobody@example.com" });
    expect(nonexistent.status).toBe(200);
  });

  it("resets the password with a valid token and revokes existing sessions", async () => {
    const { app, emailProvider } = buildTestApp();
    const user = await registerVerifiedUser(app, emailProvider);

    await request(app).post("/auth/request-password-reset").send({ email: user.email }).expect(200);
    const resetToken = emailProvider.lastToken(user.email);

    const newPassword = "a-brand-new-password-456";
    const resetRes = await request(app)
      .post("/auth/reset-password")
      .send({ token: resetToken, newPassword });
    expect(resetRes.status).toBe(200);

    // Old refresh token from before the reset is revoked.
    const oldRefreshAttempt = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: user.refreshToken });
    expect(oldRefreshAttempt.status).toBe(401);

    // Old password no longer works; new one does.
    const loginOld = await request(app).post("/auth/login").send({ email: user.email, password: user.password });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app).post("/auth/login").send({ email: user.email, password: newPassword });
    expect(loginNew.status).toBe(200);
  });

  it("rejects an invalid reset token with 410", async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: "does-not-exist", newPassword: "some-new-password-789" });
    expect(res.status).toBe(410);
  });

  it("registers with a phone number and logs in using the phone instead of email", async () => {
    const { app, emailProvider } = buildTestApp();
    const email = `${uniqueSlug("phoneuser")}@example.com`;
    const phone = uniquePhone();
    const password = "correct-horse-battery-staple";

    await request(app)
      .post("/auth/register")
      .send({ email, password, fullName: "Phone User", phone })
      .expect(201);
    const token = emailProvider.lastToken(email);
    await request(app).post("/auth/verify-email").send({ token }).expect(200);

    const loginRes = await request(app).post("/auth/login").send({ phone, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty("accessToken");

    // Email still works for the same account.
    const loginByEmail = await request(app).post("/auth/login").send({ email, password });
    expect(loginByEmail.status).toBe(200);
  });

  it("rejects registering a duplicate phone number with 409", async () => {
    const { app } = buildTestApp();
    const phone = uniquePhone();

    await request(app)
      .post("/auth/register")
      .send({
        email: `${uniqueSlug("first")}@example.com`,
        password: "correct-horse-battery-staple",
        fullName: "First User",
        phone,
      })
      .expect(201);

    const res = await request(app)
      .post("/auth/register")
      .send({
        email: `${uniqueSlug("second")}@example.com`,
        password: "correct-horse-battery-staple",
        fullName: "Second User",
        phone,
      });
    expect(res.status).toBe(409);
  });

  it("rejects a login request with both email and phone, or with neither", async () => {
    const { app } = buildTestApp();

    const both = await request(app)
      .post("/auth/login")
      .send({ email: "someone@example.com", phone: "+96170123456", password: "whatever-password" });
    expect(both.status).toBe(422);

    const neither = await request(app).post("/auth/login").send({ password: "whatever-password" });
    expect(neither.status).toBe(422);
  });
});
