import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { setupCheckoutReadyStore, uniqueSlug, validCheckoutBody } from "../helpers/fixtures.js";

describe("customer auth", () => {
  it("registers, logs in, refreshes, and logs out - full cycle, scoped to one store", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider);
    const email = `${uniqueSlug("cust")}@example.com`;
    const password = "correct-horse-battery-staple";

    const registerRes = await request(app)
      .post(`/public/stores/${store.slug}/customers/register`)
      .send({ email, password, fullName: "Full Cycle Customer" })
      .expect(201);
    expect(registerRes.body.accessToken).toBeTruthy();
    expect(registerRes.body.refreshToken).toBeTruthy();

    const meRes = await request(app)
      .get(`/public/stores/${store.slug}/customers/me`)
      .set("Authorization", `Bearer ${registerRes.body.accessToken as string}`)
      .expect(200);
    expect(meRes.body.customer.email).toBe(email);

    const loginRes = await request(app)
      .post(`/public/stores/${store.slug}/customers/login`)
      .send({ email, password })
      .expect(200);

    const refreshRes = await request(app)
      .post(`/public/stores/${store.slug}/customers/refresh`)
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);
    expect(refreshRes.body.accessToken).toBeTruthy();

    await request(app)
      .post(`/public/stores/${store.slug}/customers/logout`)
      .set("Authorization", `Bearer ${refreshRes.body.accessToken as string}`)
      .send({ refreshToken: refreshRes.body.refreshToken })
      .expect(204);

    // The just-revoked refresh token can no longer mint a new session.
    await request(app)
      .post(`/public/stores/${store.slug}/customers/refresh`)
      .send({ refreshToken: refreshRes.body.refreshToken })
      .expect(401);
  });

  it("rejects login with the wrong password, and registering twice with the same email", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider);
    const email = `${uniqueSlug("cust")}@example.com`;

    await request(app)
      .post(`/public/stores/${store.slug}/customers/register`)
      .send({ email, password: "correct-horse-battery-staple", fullName: "Someone" })
      .expect(201);

    await request(app)
      .post(`/public/stores/${store.slug}/customers/login`)
      .send({ email, password: "totally-wrong-password" })
      .expect(401);

    await request(app)
      .post(`/public/stores/${store.slug}/customers/register`)
      .send({ email, password: "another-password-1234", fullName: "Someone Else" })
      .expect(409);
  });

  it("a guest checkout's customer row is adopted (not duplicated) when that email later registers", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider);
    const body = validCheckoutBody(store.variantId, 1);
    const email = body.customerEmail as string;

    const orderRes = await request(app).post(`/public/stores/${store.slug}/checkout`).send(body).expect(201);

    const registerRes = await request(app)
      .post(`/public/stores/${store.slug}/customers/register`)
      .send({ email, password: "correct-horse-battery-staple", fullName: "Adopted Guest" })
      .expect(201);

    const ordersRes = await request(app)
      .get(`/public/stores/${store.slug}/customers/me/orders`)
      .set("Authorization", `Bearer ${registerRes.body.accessToken as string}`)
      .expect(200);
    expect(ordersRes.body).toHaveLength(1);
    expect(ordersRes.body[0].id).toBe(orderRes.body.id);
  });

  it("a Tenant A customer's token is rejected against Tenant B's endpoints", async () => {
    const { app, emailProvider } = buildTestApp();
    const storeA = await setupCheckoutReadyStore(app, emailProvider);
    const storeB = await setupCheckoutReadyStore(app, emailProvider);

    const email = `${uniqueSlug("crosscust")}@example.com`;
    const registerRes = await request(app)
      .post(`/public/stores/${storeA.slug}/customers/register`)
      .send({ email, password: "correct-horse-battery-staple", fullName: "Tenant A Customer" })
      .expect(201);
    const tokenForA = registerRes.body.accessToken as string;

    await request(app)
      .get(`/public/stores/${storeA.slug}/customers/me`)
      .set("Authorization", `Bearer ${tokenForA}`)
      .expect(200);

    await request(app)
      .get(`/public/stores/${storeB.slug}/customers/me`)
      .set("Authorization", `Bearer ${tokenForA}`)
      .expect(401);

    await request(app)
      .get(`/public/stores/${storeB.slug}/customers/me/orders`)
      .set("Authorization", `Bearer ${tokenForA}`)
      .expect(401);
  });
});
