import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import {
  createTenantForOwner,
  inviteAndActivateStaff,
  registerVerifiedUser,
  uniqueSlug,
} from "../helpers/fixtures.js";

describe("products", () => {
  it("Store Owner can create a product with variants, adjust inventory, and manage collection membership", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const productRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Classic Tee", slug: uniqueSlug("classic-tee"), brand: "Acme", gender: "unisex" });
    expect(productRes.status).toBe(201);
    expect(productRes.body.status).toBe("draft");
    expect(productRes.body.variants).toEqual([]);
    const productId = productRes.body.id;

    const variantRes = await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/variants`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), size: "M", color: "Black", priceCents: 2999 });
    expect(variantRes.status).toBe(201);
    expect(variantRes.body.quantity).toBe(0);
    const variantId = variantRes.body.id;

    const inventoryRes = await request(app)
      .patch(`/tenants/${tenantId}/products/${productId}/variants/${variantId}/inventory`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ quantity: 50 });
    expect(inventoryRes.status).toBe(200);
    expect(inventoryRes.body.quantity).toBe(50);

    const getRes = await request(app)
      .get(`/tenants/${tenantId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.variants).toHaveLength(1);
    expect(getRes.body.variants[0].quantity).toBe(50);

    // The list endpoint intentionally returns a variant *count*, not the full
    // variants/inventory payload per row - this is what the merchant-portal
    // products list actually renders.
    const listRes = await request(app)
      .get(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(listRes.status).toBe(200);
    const listedProduct = listRes.body.find((p: { id: string }) => p.id === productId);
    expect(listedProduct.variantCount).toBe(1);
    expect(listedProduct.variants).toBeUndefined();

    const collectionRes = await request(app)
      .post(`/tenants/${tenantId}/collections`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Basics", slug: uniqueSlug("basics") });
    const collectionId = collectionRes.body.id;

    await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/collections/${collectionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(204);

    const withCollection = await request(app)
      .get(`/tenants/${tenantId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(withCollection.body.collectionIds).toContain(collectionId);

    await request(app)
      .delete(`/tenants/${tenantId}/products/${productId}/collections/${collectionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(204);

    const withoutCollection = await request(app)
      .get(`/tenants/${tenantId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(withoutCollection.body.collectionIds).not.toContain(collectionId);
  });

  it("archiving a product is a soft delete (status=archived, still readable)", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const productRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Seasonal Scarf", slug: uniqueSlug("seasonal-scarf") });
    const productId = productRes.body.id;

    const archiveRes = await request(app)
      .delete(`/tenants/${tenantId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.status).toBe("archived");

    const getRes = await request(app)
      .get(`/tenants/${tenantId}/products/${productId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe("archived");
  });

  it("rejects a duplicate product slug and a duplicate variant SKU with 409", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const slug = uniqueSlug("hoodie");

    await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Hoodie", slug })
      .expect(201);

    const dupProduct = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Hoodie 2", slug });
    expect(dupProduct.status).toBe(409);

    const productRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Cap", slug: uniqueSlug("cap") });
    const productId = productRes.body.id;
    const sku = uniqueSlug("SKU");

    await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/variants`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ sku, priceCents: 1500 })
      .expect(201);

    const dupVariant = await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/variants`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ sku, priceCents: 1600 });
    expect(dupVariant.status).toBe(409);
  });

  it("rejects a malformed product payload with 422", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const res = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "", slug: "invalid slug!" });
    expect(res.status).toBe(422);
  });

  describe("permissions", () => {
    it("Order Manager can update inventory but cannot create a product", async () => {
      const { app, emailProvider } = buildTestApp();
      const owner = await registerVerifiedUser(app, emailProvider);
      const { tenantId } = await createTenantForOwner(app, owner);

      const productRes = await request(app)
        .post(`/tenants/${tenantId}/products`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ name: "Belt", slug: uniqueSlug("belt") });
      const productId = productRes.body.id;
      const variantRes = await request(app)
        .post(`/tenants/${tenantId}/products/${productId}/variants`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ sku: uniqueSlug("SKU"), priceCents: 4500 });
      const variantId = variantRes.body.id;

      const orderManager = await registerVerifiedUser(app, emailProvider);
      await inviteAndActivateStaff(app, owner, tenantId, orderManager, "order_manager");

      const inventoryRes = await request(app)
        .patch(`/tenants/${tenantId}/products/${productId}/variants/${variantId}/inventory`)
        .set("Authorization", `Bearer ${orderManager.accessToken}`)
        .send({ quantity: 10 });
      expect(inventoryRes.status).toBe(200);

      const createAttempt = await request(app)
        .post(`/tenants/${tenantId}/products`)
        .set("Authorization", `Bearer ${orderManager.accessToken}`)
        .send({ name: "Unauthorized Product", slug: uniqueSlug("unauthorized") });
      expect(createAttempt.status).toBe(403);
    });

    it("Staff (Basic) can read the catalog but cannot create or update it", async () => {
      const { app, emailProvider } = buildTestApp();
      const owner = await registerVerifiedUser(app, emailProvider);
      const { tenantId } = await createTenantForOwner(app, owner);

      const staff = await registerVerifiedUser(app, emailProvider);
      await inviteAndActivateStaff(app, owner, tenantId, staff, "staff_basic");

      const listRes = await request(app)
        .get(`/tenants/${tenantId}/products`)
        .set("Authorization", `Bearer ${staff.accessToken}`);
      expect(listRes.status).toBe(200);

      const createAttempt = await request(app)
        .post(`/tenants/${tenantId}/products`)
        .set("Authorization", `Bearer ${staff.accessToken}`)
        .send({ name: "Not Allowed", slug: uniqueSlug("not-allowed") });
      expect(createAttempt.status).toBe(403);
    });
  });

  describe("tenant isolation", () => {
    it("a non-member gets 403 on the product list", async () => {
      const { app, emailProvider } = buildTestApp();
      const owner = await registerVerifiedUser(app, emailProvider);
      const { tenantId } = await createTenantForOwner(app, owner);
      const outsider = await registerVerifiedUser(app, emailProvider);

      const res = await request(app)
        .get(`/tenants/${tenantId}/products`)
        .set("Authorization", `Bearer ${outsider.accessToken}`);
      expect(res.status).toBe(403);
    });

    it("a Tenant A member cannot fetch a Tenant B product even through Tenant A's own route", async () => {
      const { app, emailProvider } = buildTestApp();
      const ownerA = await registerVerifiedUser(app, emailProvider);
      const { tenantId: tenantAId } = await createTenantForOwner(app, ownerA);

      const ownerB = await registerVerifiedUser(app, emailProvider);
      const { tenantId: tenantBId } = await createTenantForOwner(app, ownerB);
      const productB = await request(app)
        .post(`/tenants/${tenantBId}/products`)
        .set("Authorization", `Bearer ${ownerB.accessToken}`)
        .send({ name: "Tenant B Product", slug: uniqueSlug("tenant-b-product") });

      // ownerA is a legitimate member of tenantA, so resolveTenantContext lets
      // the request through - the tenant-scoped repository's own WHERE
      // tenant_id filter is what has to catch this, not the route gate.
      const res = await request(app)
        .get(`/tenants/${tenantAId}/products/${productB.body.id}`)
        .set("Authorization", `Bearer ${ownerA.accessToken}`);
      expect(res.status).toBe(404);
    });
  });
});
