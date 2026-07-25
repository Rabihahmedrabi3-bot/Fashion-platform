import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { createTenantForOwner, registerVerifiedUser, uniqueSlug } from "../helpers/fixtures.js";

describe("categories", () => {
  it("Store Owner can create, list, update, and delete a category", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const createRes = await request(app)
      .post(`/tenants/${tenantId}/categories`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Outerwear", slug: uniqueSlug("outerwear") });
    expect(createRes.status).toBe(201);
    const categoryId = createRes.body.id;

    const listRes = await request(app)
      .get(`/tenants/${tenantId}/categories`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((c: { id: string }) => c.id === categoryId)).toBe(true);

    const updateRes = await request(app)
      .patch(`/tenants/${tenantId}/categories/${categoryId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Coats & Jackets" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe("Coats & Jackets");

    const deleteRes = await request(app)
      .delete(`/tenants/${tenantId}/categories/${categoryId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(deleteRes.status).toBe(204);
  });

  it("rejects a duplicate slug with 409", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const slug = uniqueSlug("dresses");

    await request(app)
      .post(`/tenants/${tenantId}/categories`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Dresses", slug })
      .expect(201);

    const dupRes = await request(app)
      .post(`/tenants/${tenantId}/categories`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Dresses Again", slug });
    expect(dupRes.status).toBe(409);
  });

  it("rejects a malformed payload with 422", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const res = await request(app)
      .post(`/tenants/${tenantId}/categories`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "", slug: "Not A Valid Slug!" });
    expect(res.status).toBe(422);
  });

  it("refuses to delete a category still assigned to a product (409)", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const categoryRes = await request(app)
      .post(`/tenants/${tenantId}/categories`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Footwear", slug: uniqueSlug("footwear") });
    const categoryId = categoryRes.body.id;

    await request(app)
      .post(`/tenants/${tenantId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Running Shoes", slug: uniqueSlug("running-shoes"), categoryId })
      .expect(201);

    const deleteRes = await request(app)
      .delete(`/tenants/${tenantId}/categories/${categoryId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(deleteRes.status).toBe(409);
  });

  it("a non-member gets 403, not the category data", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const outsider = await registerVerifiedUser(app, emailProvider);

    const res = await request(app)
      .get(`/tenants/${tenantId}/categories`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);
    expect(res.status).toBe(403);
  });
});
