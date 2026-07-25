import type { Express } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { approveTenant, createTenantForOwner, registerVerifiedUser, uniqueSlug } from "../helpers/fixtures.js";

async function activateProduct(app: Express, accessToken: string, tenantId: string, productId: string): Promise<void> {
  await request(app)
    .patch(`/tenants/${tenantId}/products/${productId}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ status: "active" })
    .expect(200);
}

describe("public catalog", () => {
  it("a non-active store returns 404 on every public endpoint, even though the data exists", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { slug } = await createTenantForOwner(app, owner);
    // Deliberately not approved - still pending_approval.

    expect((await request(app).get(`/public/stores/${slug}`)).status).toBe(404);
    expect((await request(app).get(`/public/stores/${slug}/products`)).status).toBe(404);
    expect((await request(app).get(`/public/stores/${slug}/categories`)).status).toBe(404);
    expect((await request(app).get(`/public/stores/${slug}/products/anything`)).status).toBe(404);
  });

  it("only active products are listed or fetchable by slug - draft and archived are hidden", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId, slug } = await createTenantForOwner(app, owner);
    await approveTenant(app, emailProvider, tenantId);

    const activeRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Active Product", slug: uniqueSlug("active-product") });
    await activateProduct(app, owner.accessToken, tenantId, activeRes.body.id);

    const draftRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Draft Product", slug: uniqueSlug("draft-product") });

    const archivedRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Archived Product", slug: uniqueSlug("archived-product") });
    await request(app)
      .delete(`/tenants/${tenantId}/products/${archivedRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(200);

    const listRes = await request(app).get(`/public/stores/${slug}/products`);
    expect(listRes.status).toBe(200);
    const ids = listRes.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(activeRes.body.id);
    expect(ids).not.toContain(draftRes.body.id);
    expect(ids).not.toContain(archivedRes.body.id);

    const activeDetail = await request(app).get(`/public/stores/${slug}/products/${activeRes.body.slug as string}`);
    expect(activeDetail.status).toBe(200);

    const draftDetail = await request(app).get(`/public/stores/${slug}/products/${draftRes.body.slug as string}`);
    expect(draftDetail.status).toBe(404);
  });

  it("computes the cheapest ACTIVE variant's price and excludes archived variants from it", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId, slug } = await createTenantForOwner(app, owner);
    await approveTenant(app, emailProvider, tenantId);

    const productRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Priced Product", slug: uniqueSlug("priced-product") });
    const productId = productRes.body.id;
    await activateProduct(app, owner.accessToken, tenantId, productId);

    await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/variants`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 5000 })
      .expect(201);

    await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/variants`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 2000 })
      .expect(201);

    // Cheaper than both, but archived - should NOT count toward the "from" price.
    const cheapestButArchived = await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/variants`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 500 });
    await request(app)
      .delete(`/tenants/${tenantId}/products/${productId}/variants/${cheapestButArchived.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(200);

    const listRes = await request(app).get(`/public/stores/${slug}/products`);
    const listed = listRes.body.find((p: { id: string }) => p.id === productId);
    expect(listed.priceCentsFrom).toBe(2000);

    const detailRes = await request(app).get(`/public/stores/${slug}/products/${productRes.body.slug as string}`);
    expect(detailRes.body.variants).toHaveLength(2);
  });

  it("filters by category slug and lists categories for nav", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId, slug } = await createTenantForOwner(app, owner);
    await approveTenant(app, emailProvider, tenantId);

    const categoryRes = await request(app)
      .post(`/tenants/${tenantId}/categories`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Outerwear", slug: uniqueSlug("outerwear") });

    const inCategoryRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "In Category", slug: uniqueSlug("in-category"), categoryId: categoryRes.body.id });
    await activateProduct(app, owner.accessToken, tenantId, inCategoryRes.body.id);

    const outsideCategoryRes = await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Outside Category", slug: uniqueSlug("outside-category") });
    await activateProduct(app, owner.accessToken, tenantId, outsideCategoryRes.body.id);

    const filteredRes = await request(app).get(
      `/public/stores/${slug}/products?category=${categoryRes.body.slug as string}`,
    );
    const ids = filteredRes.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(inCategoryRes.body.id);
    expect(ids).not.toContain(outsideCategoryRes.body.id);

    const categoriesRes = await request(app).get(`/public/stores/${slug}/categories`);
    expect(categoriesRes.status).toBe(200);
    expect(categoriesRes.body.some((c: { id: string }) => c.id === categoryRes.body.id)).toBe(true);
  });

  it("the theme config round-trips through PATCH /tenants/:id/store and is visible publicly", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId, slug } = await createTenantForOwner(app, owner);
    await approveTenant(app, emailProvider, tenantId);

    const theme = {
      hero: { title: "Summer sale", subtitle: "Up to 50% off" },
      productGrid: { enabled: true, title: "New arrivals" },
    };
    await request(app)
      .patch(`/tenants/${tenantId}/store`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ brandingThemeConfig: theme })
      .expect(200);

    const publicRes = await request(app).get(`/public/stores/${slug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.brandingThemeConfig.hero.title).toBe("Summer sale");
    expect(publicRes.body.brandingThemeConfig.productGrid.title).toBe("New arrivals");
  });
});
