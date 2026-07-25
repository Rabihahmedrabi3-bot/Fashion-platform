import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import {
  registerPlatformAdmin,
  registerVerifiedUser,
  setupCheckoutReadyStore,
  validCheckoutBody,
} from "../helpers/fixtures.js";

describe("admin analytics", () => {
  it("a non-admin gets 403", async () => {
    const { app, emailProvider } = buildTestApp();
    const user = await registerVerifiedUser(app, emailProvider);
    await request(app).get("/admin/analytics").set("Authorization", `Bearer ${user.accessToken}`).expect(403);
  });

  it("revenue and order totals exclude cancelled orders, and tenant-status counts are real", async () => {
    const { app, emailProvider } = buildTestApp();
    const admin = await registerPlatformAdmin(app, emailProvider);
    const store = await setupCheckoutReadyStore(app, emailProvider, { priceCents: 4000, quantity: 20 });

    const keptOrder = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 2))
      .expect(201);
    const cancelledOrder = await request(app)
      .post(`/public/stores/${store.slug}/checkout`)
      .send(validCheckoutBody(store.variantId, 3))
      .expect(201);

    await request(app)
      .patch(`/tenants/${store.tenantId}/orders/${cancelledOrder.body.id}/status`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ status: "cancelled" })
      .expect(200);

    const analyticsRes = await request(app)
      .get("/admin/analytics")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);

    // Only the kept order (2 x $40 = $80) counts toward revenue - the cancelled one (3 x $40 = $120) doesn't.
    expect(analyticsRes.body.totalRevenueCents).toBe(8000);
    expect(analyticsRes.body.totalOrders).toBe(1);
    expect(analyticsRes.body.ordersByStatus.pending).toBe(1);
    expect(analyticsRes.body.ordersByStatus.cancelled).toBe(1);

    // One active tenant exists (the checkout-ready store), created and approved by setupCheckoutReadyStore.
    expect(analyticsRes.body.tenantsByStatus.active).toBeGreaterThanOrEqual(1);

    const topProduct = analyticsRes.body.topProducts.find((p: { tenantId: string }) => p.tenantId === store.tenantId);
    expect(topProduct).toBeTruthy();
    expect(topProduct.quantitySold).toBe(2);
    expect(topProduct.revenueCents).toBe(8000);
    expect(keptOrder.body.status).toBe("pending");
  });
});
