import type { Express } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { createTenantForOwner, makePlatformAdmin, registerVerifiedUser } from "../helpers/fixtures.js";
import type { TestEmailProvider } from "../helpers/testEmailProvider.js";

async function registerAdmin(app: Express, emailProvider: TestEmailProvider) {
  const admin = await registerVerifiedUser(app, emailProvider);
  await makePlatformAdmin(admin.id);
  return admin;
}

describe("admin", () => {
  it("a Super Admin can list pending tenants, approve one, and it becomes active with an audit log row", async () => {
    const { app, emailProvider } = buildTestApp();
    const admin = await registerAdmin(app, emailProvider);

    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const listRes = await request(app)
      .get("/admin/tenants?status=pending_approval")
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((t: { id: string }) => t.id === tenantId)).toBe(true);

    const approveRes = await request(app)
      .post(`/admin/tenants/${tenantId}/approve`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("active");

    const ownerCanRead = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(ownerCanRead.body.status).toBe("active");

    // stores.status is a separate field from tenants.status - approving the
    // tenant must also activate its store, or the public storefront can
    // never serve it (see repositories/tenantsRepo.ts adminApproveTenant).
    const storeRes = await request(app)
      .get(`/tenants/${tenantId}/store`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(storeRes.body.status).toBe("active");

    const auditRes = await request(app)
      .get(`/admin/audit-logs?tenantId=${tenantId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body).toHaveLength(1);
    expect(auditRes.body[0]).toMatchObject({
      action: "tenant.approve",
      targetType: "tenant",
      targetId: tenantId,
      tenantId,
    });
  });

  it("approving an already-approved tenant returns 409, and approving a nonexistent tenant returns 404", async () => {
    const { app, emailProvider } = buildTestApp();
    const admin = await registerAdmin(app, emailProvider);
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    await request(app)
      .post(`/admin/tenants/${tenantId}/approve`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);

    const secondApprove = await request(app)
      .post(`/admin/tenants/${tenantId}/approve`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(secondApprove.status).toBe(409);

    const nonexistent = await request(app)
      .post("/admin/tenants/00000000-0000-0000-0000-000000000000/approve")
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(nonexistent.status).toBe(404);
  });

  it("a Super Admin can reject a pending tenant, and can suspend an active one - both audit-logged", async () => {
    const { app, emailProvider } = buildTestApp();
    const admin = await registerAdmin(app, emailProvider);

    const ownerToReject = await registerVerifiedUser(app, emailProvider);
    const { tenantId: rejectedId } = await createTenantForOwner(app, ownerToReject);
    const rejectRes = await request(app)
      .post(`/admin/tenants/${rejectedId}/reject`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ reason: "incomplete application" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe("rejected");

    const ownerToSuspend = await registerVerifiedUser(app, emailProvider);
    const { tenantId: suspendedId } = await createTenantForOwner(app, ownerToSuspend);
    await request(app)
      .post(`/admin/tenants/${suspendedId}/approve`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
    const suspendRes = await request(app)
      .post(`/admin/tenants/${suspendedId}/suspend`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.status).toBe("suspended");

    const storeAfterSuspend = await request(app)
      .get(`/tenants/${suspendedId}/store`)
      .set("Authorization", `Bearer ${ownerToSuspend.accessToken}`);
    expect(storeAfterSuspend.body.status).toBe("suspended");

    const rejectedAudit = await request(app)
      .get(`/admin/audit-logs?tenantId=${rejectedId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(rejectedAudit.body).toHaveLength(1);
    expect(rejectedAudit.body[0].action).toBe("tenant.reject");

    const suspendedAudit = await request(app)
      .get(`/admin/audit-logs?tenantId=${suspendedId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    // approve + suspend = 2 rows for this tenant.
    expect(suspendedAudit.body).toHaveLength(2);
    expect(suspendedAudit.body.map((row: { action: string }) => row.action).sort()).toEqual([
      "tenant.approve",
      "tenant.suspend",
    ]);
  });

  it("full lifecycle: register -> verify -> create tenant -> pending_approval -> admin approves -> active", async () => {
    const { app, emailProvider } = buildTestApp();
    const admin = await registerAdmin(app, emailProvider);
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const pending = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(pending.body.status).toBe("pending_approval");

    await request(app)
      .post(`/admin/tenants/${tenantId}/approve`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);

    const active = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(active.body.status).toBe("active");
  });
});
