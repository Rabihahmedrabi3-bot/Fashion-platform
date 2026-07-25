import type { Express } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import {
  inviteAndActivateStaff,
  registerVerifiedUser,
  setupCheckoutReadyStore,
  validCheckoutBody,
} from "../helpers/fixtures.js";

async function getVariantQuantity(
  app: Express,
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

describe("orders", () => {
  it("tenant isolation: Tenant A staff cannot see Tenant B's orders", async () => {
    const { app, emailProvider } = buildTestApp();
    const storeA = await setupCheckoutReadyStore(app, emailProvider);
    const storeB = await setupCheckoutReadyStore(app, emailProvider);

    const orderB = await request(app)
      .post(`/public/stores/${storeB.slug}/checkout`)
      .send(validCheckoutBody(storeB.variantId, 1))
      .expect(201);

    const listRes = await request(app)
      .get(`/tenants/${storeA.tenantId}/orders`)
      .set("Authorization", `Bearer ${storeA.owner.accessToken}`)
      .expect(200);
    expect(listRes.body.some((o: { id: string }) => o.id === orderB.body.id)).toBe(false);

    await request(app)
      .get(`/tenants/${storeA.tenantId}/orders/${orderB.body.id}`)
      .set("Authorization", `Bearer ${storeA.owner.accessToken}`)
      .expect(404);
  });

  it("order_manager and store_owner can update order status; staff_basic and catalog_manager cannot", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider);
    const order = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 1))
      .expect(201);

    const staffBasic = await registerVerifiedUser(app, emailProvider);
    await inviteAndActivateStaff(app, store.owner, store.tenantId, staffBasic, "staff_basic");
    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${staffBasic.accessToken}`)
      .send({ status: "confirmed" })
      .expect(403);

    const catalogManager = await registerVerifiedUser(app, emailProvider);
    await inviteAndActivateStaff(app, store.owner, store.tenantId, catalogManager, "catalog_manager");
    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${catalogManager.accessToken}`)
      .send({ status: "confirmed" })
      .expect(403);

    const orderManager = await registerVerifiedUser(app, emailProvider);
    await inviteAndActivateStaff(app, store.owner, store.tenantId, orderManager, "order_manager");
    const res = await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${orderManager.accessToken}`)
      .send({ status: "confirmed" })
      .expect(200);
    expect(res.body.status).toBe("confirmed");

    const res2 = await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "fulfilled" })
      .expect(200);
    expect(res2.body.status).toBe("fulfilled");
  });

  it("rejects illegal status transitions", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider);
    const order = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 1))
      .expect(201);

    // pending -> delivered is not a legal direct transition.
    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "delivered" })
      .expect(409);

    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "confirmed" })
      .expect(200);

    // confirmed -> delivered is also not legal - fulfilled comes first.
    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "delivered" })
      .expect(409);

    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "fulfilled" })
      .expect(200);
    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "delivered" })
      .expect(200);

    // delivered is terminal.
    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "cancelled" })
      .expect(409);
  });

  it("cancelling an order restocks inventory", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider, { quantity: 10 });
    const order = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 4))
      .expect(201);

    const afterCheckout = await getVariantQuantity(
      app,
      store.owner.accessToken,
      store.tenantId,
      store.productId,
      store.variantId,
    );
    expect(afterCheckout).toBe(6);

    const cancelRes = await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "cancelled" })
      .expect(200);
    expect(cancelRes.body.status).toBe("cancelled");
    expect(cancelRes.body.cancelledAt).toBeTruthy();

    const afterCancel = await getVariantQuantity(
      app,
      store.owner.accessToken,
      store.tenantId,
      store.productId,
      store.variantId,
    );
    expect(afterCancel).toBe(10);
  });

  it("marking COD collected is independent of the order's fulfillment status", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider);
    const order = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 1))
      .expect(201);
    expect(order.body.payment.status).toBe("pending");

    // Payment can be marked collected while the order is still just "pending" fulfillment.
    const paymentRes = await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${order.body.id}/payment`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "collected" })
      .expect(200);
    expect(paymentRes.body.status).toBe("collected");
    expect(paymentRes.body.collectedAt).toBeTruthy();

    const detailRes = await request(app)
      .get(`/tenants/${store.tenantId}/orders/${order.body.id}`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);
    expect(detailRes.body.status).toBe("pending");
    expect(detailRes.body.payment.status).toBe("collected");
  });
});
