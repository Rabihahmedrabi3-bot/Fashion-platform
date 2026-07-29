import type { Express } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { approveTenant, createTenantForOwner, registerVerifiedUser, uniqueSlug } from "../helpers/fixtures.js";
import type { TestEmailProvider } from "../helpers/testEmailProvider.js";

async function activateProduct(app: Express, accessToken: string, tenantId: string, productId: string): Promise<void> {
  await request(app)
    .patch(`/tenants/${tenantId}/products/${productId}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ status: "active" })
    .expect(200);
}

async function setMarketplaceEligible(
  app: Express,
  accessToken: string,
  tenantId: string,
  eligible: boolean,
): Promise<void> {
  await request(app)
    .patch(`/tenants/${tenantId}/store`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ marketplaceEligible: eligible })
    .expect(200);
}

interface EligibleStore {
  owner: Awaited<ReturnType<typeof registerVerifiedUser>>;
  tenantId: string;
  slug: string;
}

async function setupEligibleActiveStore(app: Express, emailProvider: TestEmailProvider): Promise<EligibleStore> {
  const owner = await registerVerifiedUser(app, emailProvider);
  const { tenantId, slug } = await createTenantForOwner(app, owner);
  await approveTenant(app, emailProvider, tenantId);
  await setMarketplaceEligible(app, owner.accessToken, tenantId, true);
  return { owner, tenantId, slug };
}

describe("public marketplace", () => {
  it("only lists active products from marketplace-eligible, active stores", async () => {
    const { app, emailProvider } = buildTestApp();

    const eligibleStore = await setupEligibleActiveStore(app, emailProvider);
    const eligibleProductRes = await request(app)
      .post(`/tenants/${eligibleStore.tenantId}/products`)
      .set("Authorization", `Bearer ${eligibleStore.owner.accessToken}`)
      .send({ name: "Eligible Store Product", slug: uniqueSlug("eligible-product") });
    await activateProduct(app, eligibleStore.owner.accessToken, eligibleStore.tenantId, eligibleProductRes.body.id);

    // Eligible but still pending_approval - not active - should be excluded.
    const pendingOwner = await registerVerifiedUser(app, emailProvider);
    const { tenantId: pendingTenantId } = await createTenantForOwner(app, pendingOwner);
    await setMarketplaceEligible(app, pendingOwner.accessToken, pendingTenantId, true);
    const pendingProductRes = await request(app)
      .post(`/tenants/${pendingTenantId}/products`)
      .set("Authorization", `Bearer ${pendingOwner.accessToken}`)
      .send({ name: "Pending Store Product", slug: uniqueSlug("pending-product") });

    // Active but never opted in - should be excluded.
    const notEligibleOwner = await registerVerifiedUser(app, emailProvider);
    const { tenantId: notEligibleTenantId } = await createTenantForOwner(app, notEligibleOwner);
    await approveTenant(app, emailProvider, notEligibleTenantId);
    const notEligibleProductRes = await request(app)
      .post(`/tenants/${notEligibleTenantId}/products`)
      .set("Authorization", `Bearer ${notEligibleOwner.accessToken}`)
      .send({ name: "Not Eligible Store Product", slug: uniqueSlug("not-eligible-product") });
    await activateProduct(app, notEligibleOwner.accessToken, notEligibleTenantId, notEligibleProductRes.body.id);

    // Eligible + active store, but the product itself is still draft - should be excluded.
    const draftProductRes = await request(app)
      .post(`/tenants/${eligibleStore.tenantId}/products`)
      .set("Authorization", `Bearer ${eligibleStore.owner.accessToken}`)
      .send({ name: "Draft Product In Eligible Store", slug: uniqueSlug("draft-in-eligible") });

    const res = await request(app).get("/public/marketplace/products").expect(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(eligibleProductRes.body.id);
    expect(ids).not.toContain(pendingProductRes.body.id);
    expect(ids).not.toContain(notEligibleProductRes.body.id);
    expect(ids).not.toContain(draftProductRes.body.id);

    const listedEligible = res.body.find((p: { id: string }) => p.id === eligibleProductRes.body.id);
    expect(listedEligible.storeSlug).toBe(eligibleStore.slug);
  });

  it("search filters by a case-insensitive substring match on product name", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const jacketRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Denim Jacket", slug: uniqueSlug("denim-jacket") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, jacketRes.body.id);

    const shirtRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Cotton Shirt", slug: uniqueSlug("cotton-shirt") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, shirtRes.body.id);

    const res = await request(app).get("/public/marketplace/products?search=jacket").expect(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(jacketRes.body.id);
    expect(ids).not.toContain(shirtRes.body.id);
  });

  it("computes the cheapest ACTIVE variant's price, and each row carries its store's slug and name", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const productRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Priced Product", slug: uniqueSlug("priced-product") });
    const productId = productRes.body.id;
    await activateProduct(app, store.owner.accessToken, store.tenantId, productId);

    await request(app)
      .post(`/tenants/${store.tenantId}/products/${productId}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 5000 })
      .expect(201);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${productId}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 2000 })
      .expect(201);

    const res = await request(app).get("/public/marketplace/products").expect(200);
    const listed = res.body.find((p: { id: string }) => p.id === productId);
    expect(listed.priceCentsFrom).toBe(2000);
    expect(listed.storeSlug).toBe(store.slug);
    expect(typeof listed.storeName).toBe("string");
  });

  it("aiQuery routes through the intent parser and filters by the structured attributes it returns", async () => {
    const { app, emailProvider, intentParser } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const weddingDressRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({
        name: "Evening Gown",
        slug: uniqueSlug("evening-gown"),
        gender: "women",
        occasion: "wedding",
      });
    await activateProduct(app, store.owner.accessToken, store.tenantId, weddingDressRes.body.id);

    const casualShirtRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({
        name: "Casual Tee",
        slug: uniqueSlug("casual-tee"),
        gender: "men",
        occasion: "casual",
      });
    await activateProduct(app, store.owner.accessToken, store.tenantId, casualShirtRes.body.id);

    intentParser.nextResponse = { gender: "women", occasion: "wedding" };
    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "something elegant for a wedding" })
      .expect(200);

    expect(intentParser.calls).toContain("something elegant for a wedding");
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(weddingDressRes.body.id);
    expect(ids).not.toContain(casualShirtRes.body.id);
  });

  it("aiQuery-derived price range filters correctly include/exclude by cheapest active variant price", async () => {
    const { app, emailProvider, intentParser } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const cheapRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Budget Dress", slug: uniqueSlug("budget-dress") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, cheapRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${cheapRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 3000 })
      .expect(201);

    const pricyRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Designer Dress", slug: uniqueSlug("designer-dress") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, pricyRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${pricyRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 20000 })
      .expect(201);

    intentParser.nextResponse = { maxPriceCents: 5000 };
    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "a dress under $50" })
      .expect(200);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(cheapRes.body.id);
    expect(ids).not.toContain(pricyRes.body.id);
  });

  it("falls back gracefully to a keyword search when the intent parser fails", async () => {
    const { app, emailProvider, intentParser } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const jacketRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Leather Jacket", slug: uniqueSlug("leather-jacket") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, jacketRes.body.id);

    intentParser.nextResponse = "fail";
    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "Leather Jacket" })
      .expect(200);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(jacketRes.body.id);
  });
});
