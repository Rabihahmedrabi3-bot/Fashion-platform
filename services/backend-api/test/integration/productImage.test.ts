import type { Express } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import {
  createTenantForOwner,
  inviteAndActivateStaff,
  registerVerifiedUser,
  uniqueSlug,
} from "../helpers/fixtures.js";

// A minimal valid 1x1 transparent PNG - real magic bytes, not just a .png extension.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function createProduct(app: Express, accessToken: string, tenantId: string) {
  const res = await request(app)
    .post(`/tenants/${tenantId}/products`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: "Photo Product", slug: uniqueSlug("photo-product") });
  return res.body.id as string;
}

describe("product image upload", () => {
  it("uploads a real image, updates imageUrl, and records the upload against the products folder", async () => {
    const { app, emailProvider, imageStorage } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const productId = await createProduct(app, owner.accessToken, tenantId);

    const uploadRes = await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/image`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .attach("image", TINY_PNG, "photo.png");
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.imageUrl).toMatch(/^https:\/\/test-image-storage\.local\/products\/.+\.png$/);
    expect(imageStorage.uploaded).toContainEqual({ folder: "products", extension: "png" });
  });

  it("rejects a file whose real content doesn't match an image (magic-byte check), even with a .png name", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const productId = await createProduct(app, owner.accessToken, tenantId);

    const res = await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/image`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .attach("image", Buffer.from("this is not an image, just text"), "fake.png");
    expect(res.status).toBe(422);
  });

  it("rejects a file over the size limit", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const productId = await createProduct(app, owner.accessToken, tenantId);

    const oversized = Buffer.alloc(6 * 1024 * 1024, 0);
    const res = await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/image`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .attach("image", oversized, "big.png");
    expect(res.status).toBe(422);
  });

  it("Staff (Basic, read-only) gets 403", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const productId = await createProduct(app, owner.accessToken, tenantId);

    const staff = await registerVerifiedUser(app, emailProvider);
    await inviteAndActivateStaff(app, owner, tenantId, staff, "staff_basic");

    const res = await request(app)
      .post(`/tenants/${tenantId}/products/${productId}/image`)
      .set("Authorization", `Bearer ${staff.accessToken}`)
      .attach("image", TINY_PNG, "photo.png");
    expect(res.status).toBe(403);
  });

  it("a Tenant A member cannot upload an image against a Tenant B product", async () => {
    const { app, emailProvider } = buildTestApp();
    const ownerA = await registerVerifiedUser(app, emailProvider);
    const { tenantId: tenantAId } = await createTenantForOwner(app, ownerA);

    const ownerB = await registerVerifiedUser(app, emailProvider);
    const { tenantId: tenantBId } = await createTenantForOwner(app, ownerB);
    const productBId = await createProduct(app, ownerB.accessToken, tenantBId);

    const res = await request(app)
      .post(`/tenants/${tenantAId}/products/${productBId}/image`)
      .set("Authorization", `Bearer ${ownerA.accessToken}`)
      .attach("image", TINY_PNG, "photo.png");
    expect(res.status).toBe(404);
  });
});
