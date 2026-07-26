import { describe, expect, it } from "vitest";
import request from "supertest";
import { SYSTEM_ROLE_KEYS } from "@fashion-platform/shared-types";
import { buildTestApp } from "../helpers/testApp.js";
import { createTenantForOwner, inviteAndActivateStaff, registerVerifiedUser } from "../helpers/fixtures.js";

// A minimal valid 1x1 transparent PNG - real magic bytes, not just a .png extension.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("store logo upload", () => {
  it("uploads a logo, updates brandingLogoUrl, and it round-trips through GET /store", async () => {
    const { app, emailProvider, imageStorage } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const uploadRes = await request(app)
      .post(`/tenants/${tenantId}/store/logo`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .attach("image", TINY_PNG, "logo.png");
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.brandingLogoUrl).toMatch(/^https:\/\/test-image-storage\.local\/stores\/logo\/.+\.png$/);
    expect(imageStorage.uploaded).toContainEqual({ folder: "stores/logo", extension: "png" });

    const getRes = await request(app)
      .get(`/tenants/${tenantId}/store`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(getRes.body.brandingLogoUrl).toBe(uploadRes.body.brandingLogoUrl);
  });

  it("rejects a file whose real content doesn't match an image (magic-byte check)", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const res = await request(app)
      .post(`/tenants/${tenantId}/store/logo`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .attach("image", Buffer.from("not an image"), "fake.png");
    expect(res.status).toBe(422);
  });

  it("a Catalog Manager (no STORE_UPDATE) gets 403", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const catalogManager = await registerVerifiedUser(app, emailProvider);
    await inviteAndActivateStaff(app, owner, tenantId, catalogManager, SYSTEM_ROLE_KEYS.CATALOG_MANAGER);

    const res = await request(app)
      .post(`/tenants/${tenantId}/store/logo`)
      .set("Authorization", `Bearer ${catalogManager.accessToken}`)
      .attach("image", TINY_PNG, "logo.png");
    expect(res.status).toBe(403);
  });

  it("a Tenant A member cannot upload a logo against Tenant B's store", async () => {
    const { app, emailProvider } = buildTestApp();
    const ownerA = await registerVerifiedUser(app, emailProvider);
    await createTenantForOwner(app, ownerA);

    const ownerB = await registerVerifiedUser(app, emailProvider);
    const { tenantId: tenantBId } = await createTenantForOwner(app, ownerB);

    const res = await request(app)
      .post(`/tenants/${tenantBId}/store/logo`)
      .set("Authorization", `Bearer ${ownerA.accessToken}`)
      .attach("image", TINY_PNG, "logo.png");
    expect(res.status).toBe(403);
  });
});

describe("theme hero image upload", () => {
  it("uploads a hero image and updates only brandingThemeConfig.hero.imageUrl", async () => {
    const { app, emailProvider, imageStorage } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    await request(app)
      .patch(`/tenants/${tenantId}/store`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ brandingThemeConfig: { hero: { title: "Summer sale", subtitle: "Up to 50% off" } } })
      .expect(200);

    const uploadRes = await request(app)
      .post(`/tenants/${tenantId}/store/theme/hero-image`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .attach("image", TINY_PNG, "hero.png");
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.brandingThemeConfig.hero.imageUrl).toMatch(
      /^https:\/\/test-image-storage\.local\/stores\/theme\/.+\.png$/,
    );
    expect(uploadRes.body.brandingThemeConfig.hero.title).toBe("Summer sale");
    expect(uploadRes.body.brandingThemeConfig.hero.subtitle).toBe("Up to 50% off");
    expect(imageStorage.uploaded).toContainEqual({ folder: "stores/theme", extension: "png" });
  });

  it("a Catalog Manager (no STORE_UPDATE) gets 403", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const catalogManager = await registerVerifiedUser(app, emailProvider);
    await inviteAndActivateStaff(app, owner, tenantId, catalogManager, SYSTEM_ROLE_KEYS.CATALOG_MANAGER);

    const res = await request(app)
      .post(`/tenants/${tenantId}/store/theme/hero-image`)
      .set("Authorization", `Bearer ${catalogManager.accessToken}`)
      .attach("image", TINY_PNG, "hero.png");
    expect(res.status).toBe(403);
  });
});
