import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { registerPlatformAdmin, registerVerifiedUser, uniqueSlug } from "../helpers/fixtures.js";

describe("admin settings", () => {
  it("GET /users/me reports isPlatformAdmin accurately", async () => {
    const { app, emailProvider } = buildTestApp();
    const regularUser = await registerVerifiedUser(app, emailProvider);
    const regularMe = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${regularUser.accessToken}`)
      .expect(200);
    expect(regularMe.body.isPlatformAdmin).toBe(false);

    const admin = await registerPlatformAdmin(app, emailProvider);
    const adminMe = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(adminMe.body.isPlatformAdmin).toBe(true);
  });

  it("only a platform admin can read or update platform settings", async () => {
    const { app, emailProvider } = buildTestApp();
    const storeOwner = await registerVerifiedUser(app, emailProvider);

    await request(app)
      .get("/admin/settings")
      .set("Authorization", `Bearer ${storeOwner.accessToken}`)
      .expect(403);
    await request(app)
      .patch("/admin/settings")
      .set("Authorization", `Bearer ${storeOwner.accessToken}`)
      .send({ tenantRegistrationOpen: false })
      .expect(403);

    const admin = await registerPlatformAdmin(app, emailProvider);
    const getRes = await request(app)
      .get("/admin/settings")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(getRes.body.tenantRegistrationOpen).toBe(true);
  });

  it("closing registration rejects POST /tenants, and reopening it lets creation succeed again", async () => {
    const { app, emailProvider } = buildTestApp();
    const admin = await registerPlatformAdmin(app, emailProvider);

    await request(app)
      .patch("/admin/settings")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ tenantRegistrationOpen: false })
      .expect(200);

    const applicant = await registerVerifiedUser(app, emailProvider);
    const closedRes = await request(app)
      .post("/tenants")
      .set("Authorization", `Bearer ${applicant.accessToken}`)
      .send({ name: "Should Not Be Created", slug: uniqueSlug("closed-store") });
    expect(closedRes.status).toBe(403);

    await request(app)
      .patch("/admin/settings")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ tenantRegistrationOpen: true })
      .expect(200);

    const reopenedRes = await request(app)
      .post("/tenants")
      .set("Authorization", `Bearer ${applicant.accessToken}`)
      .send({ name: "Created After Reopening", slug: uniqueSlug("reopened-store") });
    expect(reopenedRes.status).toBe(201);
  });

  it("updating settings writes an audit log row", async () => {
    const { app, emailProvider } = buildTestApp();
    const admin = await registerPlatformAdmin(app, emailProvider);

    await request(app)
      .patch("/admin/settings")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ tenantRegistrationOpen: false })
      .expect(200);

    const auditRes = await request(app)
      .get("/admin/audit-logs")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    const settingsEntries = auditRes.body.filter(
      (row: { action: string }) => row.action === "platform_settings.update",
    );
    expect(settingsEntries).toHaveLength(1);
    expect(settingsEntries[0].metadata).toMatchObject({ tenantRegistrationOpen: false });
  });
});
