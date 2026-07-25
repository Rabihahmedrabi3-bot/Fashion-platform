import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { createTenantForOwner, registerVerifiedUser, uniqueSlug } from "../helpers/fixtures.js";

describe("collections", () => {
  it("Store Owner can create, list, update, and delete a collection", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const createRes = await request(app)
      .post(`/tenants/${tenantId}/collections`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Summer 2026", slug: uniqueSlug("summer-2026") });
    expect(createRes.status).toBe(201);
    const collectionId = createRes.body.id;

    const listRes = await request(app)
      .get(`/tenants/${tenantId}/collections`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(listRes.body.some((c: { id: string }) => c.id === collectionId)).toBe(true);

    const updateRes = await request(app)
      .patch(`/tenants/${tenantId}/collections/${collectionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ description: "Warm weather essentials" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.description).toBe("Warm weather essentials");

    const deleteRes = await request(app)
      .delete(`/tenants/${tenantId}/collections/${collectionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(deleteRes.status).toBe(204);
  });

  it("rejects a duplicate slug with 409", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const slug = uniqueSlug("new-arrivals");

    await request(app)
      .post(`/tenants/${tenantId}/collections`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "New Arrivals", slug })
      .expect(201);

    const dupRes = await request(app)
      .post(`/tenants/${tenantId}/collections`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "New Arrivals 2", slug });
    expect(dupRes.status).toBe(409);
  });

  it("a non-member gets 403", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const outsider = await registerVerifiedUser(app, emailProvider);

    const res = await request(app)
      .get(`/tenants/${tenantId}/collections`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);
    expect(res.status).toBe(403);
  });
});
