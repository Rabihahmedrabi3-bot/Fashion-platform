import { describe, expect, it } from "vitest";
import request from "supertest";
import { SYSTEM_ROLE_KEYS } from "@fashion-platform/shared-types";
import { buildTestApp } from "../helpers/testApp.js";
import {
  inviteAndActivateStaff,
  registerVerifiedUser,
  setupCheckoutReadyStore,
  validCheckoutBody,
} from "../helpers/fixtures.js";

describe("tenant analytics", () => {
  it("revenue and order totals exclude cancelled orders, scoped to this tenant only", async () => {
    const { app, emailProvider } = buildTestApp();
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
      .get(`/tenants/${store.tenantId}/analytics`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);

    // Only the kept order (2 x $40 = $80) counts toward revenue - the cancelled one (3 x $40 = $120) doesn't.
    expect(analyticsRes.body.totalRevenueCents).toBe(8000);
    expect(analyticsRes.body.totalOrders).toBe(1);
    expect(analyticsRes.body.ordersByStatus.pending).toBe(1);
    expect(analyticsRes.body.ordersByStatus.cancelled).toBe(1);

    const topProduct = analyticsRes.body.topProducts[0];
    expect(topProduct).toBeTruthy();
    expect(topProduct.quantitySold).toBe(2);
    expect(topProduct.revenueCents).toBe(8000);
    expect(keptOrder.body.status).toBe("pending");
  });

  it("a member of another tenant cannot read this tenant's analytics", async () => {
    const { app, emailProvider } = buildTestApp();
    const storeA = await setupCheckoutReadyStore(app, emailProvider);
    const outsider = await registerVerifiedUser(app, emailProvider);

    await request(app)
      .get(`/tenants/${storeA.tenantId}/analytics`)
      .set("Authorization", `Bearer ${outsider.accessToken}`)
      .expect(403);
  });

  it("Catalog Manager (no ORDER_READ) gets 403; Store Owner gets real data", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupCheckoutReadyStore(app, emailProvider);
    const catalogManager = await registerVerifiedUser(app, emailProvider);
    await inviteAndActivateStaff(app, store.owner, store.tenantId, catalogManager, SYSTEM_ROLE_KEYS.CATALOG_MANAGER);

    await request(app)
      .get(`/tenants/${store.tenantId}/analytics`)
      .set("Authorization", `Bearer ${catalogManager.accessToken}`)
      .expect(403);

    await request(app)
      .get(`/tenants/${store.tenantId}/analytics`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);
  });
});
