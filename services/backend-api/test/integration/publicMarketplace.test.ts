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

  it("aiQuery-derived color filters by the matching product's variant color, not name/description text", async () => {
    const { app, emailProvider, intentParser } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const greenShoeRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Classic Sneaker", slug: uniqueSlug("classic-sneaker") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, greenShoeRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${greenShoeRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 5000, color: "Green" })
      .expect(201);

    const redShoeRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Classic Sneaker Two", slug: uniqueSlug("classic-sneaker-two") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, redShoeRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${redShoeRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 5000, color: "Red" })
      .expect(201);

    intentParser.nextResponse = { color: "green" };
    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "green shoes" })
      .expect(200);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(greenShoeRes.body.id);
    expect(ids).not.toContain(redShoeRes.body.id);
  });

  it("aiQuery-derived multi-color value (e.g. 'grey and black' from a 'grey&black scarf' query) matches a single-color-tagged variant on any of its words", async () => {
    const { app, emailProvider, intentParser } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const greyScarfRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Grey & Black Scarf", slug: uniqueSlug("grey-black-scarf") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, greyScarfRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${greyScarfRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 2500, color: "Grey" })
      .expect(201);

    const blueScarfRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Blue Scarf", slug: uniqueSlug("blue-scarf") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, blueScarfRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${blueScarfRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 2500, color: "Blue" })
      .expect(201);

    // Simulates the AI combining both colors mentioned in "Grey&black scarf" into one string.
    intentParser.nextResponse = { color: "grey and black" };
    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "Grey&black scarf" })
      .expect(200);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(greyScarfRes.body.id);
    expect(ids).not.toContain(blueScarfRes.body.id);
  });

  it("aiQuery-derived color+size together require a single matching variant, not two unrelated ones", async () => {
    const { app, emailProvider, intentParser } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    // Has a green/M variant AND a red/L variant - should match "green, size M".
    const matchingRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Combo Tee", slug: uniqueSlug("combo-tee") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, matchingRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${matchingRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 4000, color: "Green", size: "M" })
      .expect(201);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${matchingRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 4000, color: "Red", size: "L" })
      .expect(201);

    // Has green/L and red/M, but never green AND M on the same variant - should NOT match.
    const nonMatchingRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Mismatch Tee", slug: uniqueSlug("mismatch-tee") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, nonMatchingRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${nonMatchingRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 4000, color: "Green", size: "L" })
      .expect(201);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${nonMatchingRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 4000, color: "Red", size: "M" })
      .expect(201);

    intentParser.nextResponse = { color: "green", size: "M" };
    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "green tee size M" })
      .expect(200);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(matchingRes.body.id);
    expect(ids).not.toContain(nonMatchingRes.body.id);
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

  it("aiQuery-derived minPriceCents ('above $X') excludes cheaper items the same way maxPriceCents excludes pricier ones", async () => {
    const { app, emailProvider, intentParser } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const cheapRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Budget Coat", slug: uniqueSlug("budget-coat") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, cheapRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${cheapRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 3000 })
      .expect(201);

    const pricyRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Designer Coat", slug: uniqueSlug("designer-coat") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, pricyRes.body.id);
    await request(app)
      .post(`/tenants/${store.tenantId}/products/${pricyRes.body.id}/variants`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ sku: uniqueSlug("SKU"), priceCents: 20000 })
      .expect(201);

    intentParser.nextResponse = { minPriceCents: 10000 };
    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "a coat above $100" })
      .expect(200);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(pricyRes.body.id);
    expect(ids).not.toContain(cheapRes.body.id);
  });

  it("aiQuery-derived occasion matches an occasion-appropriate product the same way for any tagged occasion (birthday party, beach, etc.), not just 'wedding'", async () => {
    const { app, emailProvider, intentParser } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const beachRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Linen Cover-Up", slug: uniqueSlug("linen-coverup"), occasion: "beach", season: "summer" });
    await activateProduct(app, store.owner.accessToken, store.tenantId, beachRes.body.id);

    const partyRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Sequin Top", slug: uniqueSlug("sequin-top"), occasion: "party" });
    await activateProduct(app, store.owner.accessToken, store.tenantId, partyRes.body.id);

    intentParser.nextResponse = { occasion: "beach", season: "summer" };
    const beachSearchRes = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "something for going to the beach" })
      .expect(200);
    const beachIds = beachSearchRes.body.map((p: { id: string }) => p.id);
    expect(beachIds).toContain(beachRes.body.id);
    expect(beachIds).not.toContain(partyRes.body.id);

    intentParser.nextResponse = { occasion: "party" };
    const partySearchRes = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "outfit for a birthday party" })
      .expect(200);
    const partyIds = partySearchRes.body.map((p: { id: string }) => p.id);
    expect(partyIds).toContain(partyRes.body.id);
    expect(partyIds).not.toContain(beachRes.body.id);
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

  it("resultRanker reorders and drops candidates that structured filtering alone can't distinguish", async () => {
    const { app, emailProvider, intentParser, resultRanker } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const productA = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Product A", slug: uniqueSlug("product-a") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productA.body.id);

    const productB = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Product B", slug: uniqueSlug("product-b") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productB.body.id);

    const productC = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Product C", slug: uniqueSlug("product-c") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productC.body.id);

    // No structured filters at all - SQL alone can't distinguish these three, so any
    // ordering/dropping in the response must have come from the ranker, not the query.
    intentParser.nextResponse = {};
    resultRanker.nextOrder = [productB.body.id, productA.body.id];

    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "something nice" })
      .expect(200);

    expect(res.body.map((p: { id: string }) => p.id)).toEqual([productB.body.id, productA.body.id]);
    expect(resultRanker.calls).toHaveLength(1);
    expect(resultRanker.calls[0].query).toBe("something nice");
    expect(resultRanker.calls[0].candidateIds.sort()).toEqual(
      [productA.body.id, productB.body.id, productC.body.id].sort(),
    );
  });

  it("falls back to the original filtered set when the resultRanker fails", async () => {
    const { app, emailProvider, intentParser, resultRanker } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const productA = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Ranker Fail A", slug: uniqueSlug("ranker-fail-a") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productA.body.id);

    const productB = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Ranker Fail B", slug: uniqueSlug("ranker-fail-b") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productB.body.id);

    intentParser.nextResponse = {};
    resultRanker.nextOrder = "fail";

    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "anything" })
      .expect(200);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(productA.body.id);
    expect(ids).toContain(productB.body.id);
  });

  it("silently drops a hallucinated id the resultRanker returns that isn't in the candidate set", async () => {
    const { app, emailProvider, intentParser, resultRanker } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const productA = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Real Product", slug: uniqueSlug("real-product") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productA.body.id);

    const productB = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Another Real Product", slug: uniqueSlug("another-real-product") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productB.body.id);

    intentParser.nextResponse = {};
    resultRanker.nextOrder = [productA.body.id, "00000000-0000-0000-0000-000000000000"];

    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "anything" })
      .expect(200);

    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toEqual([productA.body.id]);
  });

  it("dedupes a duplicated id the resultRanker returns, so the product appears only once", async () => {
    const { app, emailProvider, intentParser, resultRanker } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const productA = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Dedup Product A", slug: uniqueSlug("dedup-product-a") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productA.body.id);

    const productB = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Dedup Product B", slug: uniqueSlug("dedup-product-b") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productB.body.id);

    intentParser.nextResponse = {};
    resultRanker.nextOrder = [productA.body.id, productA.body.id, productB.body.id];

    const res = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "anything" })
      .expect(200);

    expect(res.body.map((p: { id: string }) => p.id)).toEqual([productA.body.id, productB.body.id]);
  });

  it("never invokes the resultRanker for the plain (non-AI) search path", async () => {
    const { app, emailProvider, resultRanker } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const productRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Plain Search Product", slug: uniqueSlug("plain-search-product") });
    await activateProduct(app, store.owner.accessToken, store.tenantId, productRes.body.id);

    await request(app).get("/public/marketplace/products").query({ search: "Plain Search" }).expect(200);

    expect(resultRanker.calls).toHaveLength(0);
  });

  it("never invokes the resultRanker when the aiQuery path itself narrows to 0 or 1 candidates", async () => {
    const { app, emailProvider, intentParser, resultRanker } = buildTestApp();
    const store = await setupEligibleActiveStore(app, emailProvider);

    const onlyMatchRes = await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Only Match", slug: uniqueSlug("only-match"), subcategory: "unicorn-hat" });
    await activateProduct(app, store.owner.accessToken, store.tenantId, onlyMatchRes.body.id);

    // Zero candidates.
    intentParser.nextResponse = { subcategory: "no-such-subcategory-anywhere" };
    const zeroRes = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "nothing matches this" })
      .expect(200);
    expect(zeroRes.body).toEqual([]);
    expect(resultRanker.calls).toHaveLength(0);

    // Exactly one candidate.
    intentParser.nextResponse = { subcategory: "unicorn-hat" };
    const oneRes = await request(app)
      .get("/public/marketplace/products")
      .query({ aiQuery: "unicorn hat" })
      .expect(200);
    expect(oneRes.body.map((p: { id: string }) => p.id)).toEqual([onlyMatchRes.body.id]);
    expect(resultRanker.calls).toHaveLength(0);
  });
});
