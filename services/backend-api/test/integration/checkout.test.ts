import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { setupCheckoutReadyStore, uniqueSlug, validCheckoutBody } from "../helpers/fixtures.js";

async function getVariantQuantity(
  app: import("express").Express,
  accessToken: string,
  tenantId: string,
  productId: string,
  variantId: string,
): Promise<number> {
  const res = await request(app)
    .get(`/tenants/${tenantId}/products/${productId}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .expect(200);
  const variant = (res.body.variants as Array<{ id: string; quantity: number }>).find((v) => v.id === variantId);
  if (!variant) throw new Error("variant not found in product response");
  return variant.quantity;
}

describe("checkout", () => {
  it("a guest checkout creates an order with items and a pending COD payment, and decrements inventory", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider, { priceCents: 5000, quantity: 10 });

    const res = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 3))
      .expect(201);

    expect(res.body.status).toBe("pending");
    expect(res.body.subtotalCents).toBe(15000);
    expect(res.body.totalCents).toBe(15000);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].unitPriceCents).toBe(5000);
    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.payment.method).toBe("cod");
    expect(res.body.payment.status).toBe("pending");
    expect(res.body.payment.amountCents).toBe(15000);

    const quantity = await getVariantQuantity(
      app,
      store.owner.accessToken,
      store.tenantId,
      store.productId,
      store.variantId,
    );
    expect(quantity).toBe(7);

    // Order confirmation + new-order notification both actually sent through the (dev-stub) EmailProvider.
    expect(emailProvider.sent.some((m) => m.to === (res.body.customerEmail as string))).toBe(true);
    expect(emailProvider.sent.some((m) => m.to === store.owner.email)).toBe(true);
  });

  it("price is computed server-side from the live variant, ignoring anything price-like the client sends", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider, { priceCents: 5000, quantity: 10 });

    const body = validCheckoutBody(store.variantId, 1);
    const items = body.items as Array<Record<string, unknown>>;
    const [item] = items;
    if (!item) throw new Error("expected one item");
    item.unitPriceCents = 1;
    item.priceCents = 1;

    const res = await request(app).post(`/public/stores/${store.slug}/checkout`).send(body).expect(201);
    expect(res.body.items[0].unitPriceCents).toBe(5000);
    expect(res.body.totalCents).toBe(5000);
  });

  it("rolls back the whole transaction on insufficient stock - no order created, inventory unchanged", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider, { priceCents: 3000, quantity: 2 });

    const res = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 5))
      .expect(409);
    expect(res.body.message).toMatch(/insufficient stock/i);

    const quantity = await getVariantQuantity(
      app,
      store.owner.accessToken,
      store.tenantId,
      store.productId,
      store.variantId,
    );
    expect(quantity).toBe(2);

    // A subsequent in-stock checkout still succeeds - proves the failed attempt left no partial state behind.
    const okRes = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 2))
      .expect(201);
    expect(okRes.body.status).toBe("pending");
  });

  it("a logged-in customer's checkout attaches to their own customer account, not a new guest row", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider, { priceCents: 2000, quantity: 20 });

    const email = `${uniqueSlug("regcust")}@example.com`;
    const registerRes = await request(app)
      .post(`/public/stores/${store.slug}/customers/register`)
      .send({ email, password: "correct-horse-battery-staple", fullName: "Reg Customer" })
      .expect(201);
    const customerAccessToken = registerRes.body.accessToken as string;

    const body = validCheckoutBody(store.variantId, 1);
    body.customerEmail = "someone-else@example.com"; // deliberately different - the token should win

    const orderRes = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .set("Authorization", `Bearer ${customerAccessToken}`)
      .send(body)
      .expect(201);

    const ordersRes = await request(app)
      .get(`/public/stores/${store.slug}/customers/me/orders`)
      .set("Authorization", `Bearer ${customerAccessToken}`)
      .expect(200);
    expect(ordersRes.body.some((o: { id: string }) => o.id === orderRes.body.id)).toBe(true);
  });

  it("repeat guest checkouts with the same email reuse a single customer record", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider, { priceCents: 1000, quantity: 20 });
    const body1 = validCheckoutBody(store.variantId, 1);
    const sharedEmail = body1.customerEmail as string;

    const order1 = await request(app).post(`/public/stores/${store.slug}/checkout`).send(body1).expect(201);

    const body2 = validCheckoutBody(store.variantId, 1);
    body2.customerEmail = sharedEmail;
    const order2 = await request(app).post(`/public/stores/${store.slug}/checkout`).send(body2).expect(201);

    // Both orders are visible under the same registered account once that email registers.
    const registerRes = await request(app)
      .post(`/public/stores/${store.slug}/customers/register`)
      .send({ email: sharedEmail, password: "correct-horse-battery-staple", fullName: "Repeat Guest" })
      .expect(201);
    const ordersRes = await request(app)
      .get(`/public/stores/${store.slug}/customers/me/orders`)
      .set("Authorization", `Bearer ${registerRes.body.accessToken as string}`)
      .expect(200);
    const orderIds = ordersRes.body.map((o: { id: string }) => o.id);
    expect(orderIds).toContain(order1.body.id);
    expect(orderIds).toContain(order2.body.id);
  });
});
