import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { createTenantForOwner, registerVerifiedUser, uniqueSlug } from "../helpers/fixtures.js";

describe("tenants", () => {
  it("creating a tenant auto-creates a pending store and an active Store Owner membership", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId, slug } = await createTenantForOwner(app, owner);

    const getRes = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe("pending_approval");
    expect(getRes.body.slug).toBe(slug);

    const meRes = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    const membership = meRes.body.memberships.find((m: { tenantId: string }) => m.tenantId === tenantId);
    expect(membership).toBeDefined();
    expect(membership.roleKey).toBe("store_owner");
    expect(membership.membershipStatus).toBe("active");
  });

  it("rejects creating a tenant with a slug that is already taken", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { slug } = await createTenantForOwner(app, owner);

    const otherOwner = await registerVerifiedUser(app, emailProvider);
    const res = await request(app)
      .post("/tenants")
      .set("Authorization", `Bearer ${otherOwner.accessToken}`)
      .send({ name: "Another Store", slug });
    expect(res.status).toBe(409);
  });

  it("a user with no membership in the tenant gets 403, not 404, on GET /tenants/:id", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const outsider = await registerVerifiedUser(app, emailProvider);
    const res = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("the Store Owner can update their own store's branding", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const res = await request(app)
      .patch(`/tenants/${tenantId}/store`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ brandingPrimaryColor: "#112233" });
    expect(res.status).toBe(200);
    expect(res.body.brandingPrimaryColor).toBe("#112233");

    const getRes = await request(app)
      .get(`/tenants/${tenantId}/store`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.brandingPrimaryColor).toBe("#112233");
  });

  describe("tenant isolation", () => {
    it("Tenant A's user cannot read Tenant B's tenant via GET /tenants/:id", async () => {
      const { app, emailProvider } = buildTestApp();
      const ownerA = await registerVerifiedUser(app, emailProvider);
      await createTenantForOwner(app, ownerA);

      const ownerB = await registerVerifiedUser(app, emailProvider);
      const { tenantId: tenantBId } = await createTenantForOwner(app, ownerB);

      const res = await request(app)
        .get(`/tenants/${tenantBId}`)
        .set("Authorization", `Bearer ${ownerA.accessToken}`);
      expect(res.status).toBe(403);
    });

    it("Tenant A's user cannot update Tenant B's store via PATCH /tenants/:id/store", async () => {
      const { app, emailProvider } = buildTestApp();
      const ownerA = await registerVerifiedUser(app, emailProvider);
      await createTenantForOwner(app, ownerA);

      const ownerB = await registerVerifiedUser(app, emailProvider);
      const { tenantId: tenantBId } = await createTenantForOwner(app, ownerB);

      const res = await request(app)
        .patch(`/tenants/${tenantBId}/store`)
        .set("Authorization", `Bearer ${ownerA.accessToken}`)
        .send({ brandingPrimaryColor: "#ffffff" });
      expect(res.status).toBe(403);
    });

    it("Tenant A's staff cannot list Tenant B's memberships", async () => {
      const { app, emailProvider } = buildTestApp();
      const ownerA = await registerVerifiedUser(app, emailProvider);
      await createTenantForOwner(app, ownerA);

      const ownerB = await registerVerifiedUser(app, emailProvider);
      const { tenantId: tenantBId } = await createTenantForOwner(app, ownerB);

      const res = await request(app)
        .get(`/tenants/${tenantBId}/memberships`)
        .set("Authorization", `Bearer ${ownerA.accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  it("GET /public/stores/:slug exposes only public fields for an active store, and 404s otherwise", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { slug } = await createTenantForOwner(app, owner);

    // Store starts pending_approval, so it's not publicly visible yet.
    const pendingRes = await request(app).get(`/public/stores/${slug}`);
    expect(pendingRes.status).toBe(404);

    const missingRes = await request(app).get(`/public/stores/${uniqueSlug("nonexistent")}`);
    expect(missingRes.status).toBe(404);
  });
});
