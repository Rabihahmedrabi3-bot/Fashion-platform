import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { createTenantForOwner, registerVerifiedUser } from "../helpers/fixtures.js";

describe("memberships", () => {
  it("invite -> activate -> the invited user gains exactly their role's permissions", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const invitee = await registerVerifiedUser(app, emailProvider);

    const inviteRes = await request(app)
      .post(`/tenants/${tenantId}/memberships`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, roleKey: "staff_basic" });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.status).toBe("invited");
    const membershipId = inviteRes.body.id;

    // Not active yet - no tenant access.
    const beforeActivate = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${invitee.accessToken}`);
    expect(beforeActivate.status).toBe(403);

    const activateRes = await request(app)
      .patch(`/tenants/${tenantId}/memberships/${membershipId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "active" });
    expect(activateRes.status).toBe(200);

    const afterActivate = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${invitee.accessToken}`);
    expect(afterActivate.status).toBe(200);

    // staff_basic has store:read/tenant:read but not staff:create.
    const staffTriesToInvite = await request(app)
      .post(`/tenants/${tenantId}/memberships`)
      .set("Authorization", `Bearer ${invitee.accessToken}`)
      .send({ email: owner.email, roleKey: "staff_basic" });
    expect(staffTriesToInvite.status).toBe(403);
  });

  it("a Store Manager cannot assign the Store Owner role", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const manager = await registerVerifiedUser(app, emailProvider);
    const inviteManagerRes = await request(app)
      .post(`/tenants/${tenantId}/memberships`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: manager.email, roleKey: "store_manager" });
    await request(app)
      .patch(`/tenants/${tenantId}/memberships/${inviteManagerRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "active" });

    const wouldBeOwner = await registerVerifiedUser(app, emailProvider);
    const res = await request(app)
      .post(`/tenants/${tenantId}/memberships`)
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send({ email: wouldBeOwner.email, roleKey: "store_owner" });
    expect(res.status).toBe(403);
  });

  it("a revoked membership loses access on the very next request, not after token expiry", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);
    const staff = await registerVerifiedUser(app, emailProvider);

    const inviteRes = await request(app)
      .post(`/tenants/${tenantId}/memberships`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: staff.email, roleKey: "staff_basic" });
    await request(app)
      .patch(`/tenants/${tenantId}/memberships/${inviteRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "active" });

    const beforeRevoke = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${staff.accessToken}`);
    expect(beforeRevoke.status).toBe(200);

    const revokeRes = await request(app)
      .delete(`/tenants/${tenantId}/memberships/${inviteRes.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(revokeRes.status).toBe(204);

    // Same still-valid access token, same route - now rejected, because tenant
    // context is resolved fresh from the DB on every request.
    const afterRevoke = await request(app)
      .get(`/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${staff.accessToken}`);
    expect(afterRevoke.status).toBe(403);
  });

  it("a non-admin (including a Store Owner) gets 403 on every /admin/* route", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    await createTenantForOwner(app, owner);

    const listRes = await request(app)
      .get("/admin/tenants")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(listRes.status).toBe(403);

    const auditRes = await request(app)
      .get("/admin/audit-logs")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(auditRes.status).toBe(403);
  });

  it("inviting an email with no existing account fails (must register first)", async () => {
    const { app, emailProvider } = buildTestApp();
    const owner = await registerVerifiedUser(app, emailProvider);
    const { tenantId } = await createTenantForOwner(app, owner);

    const res = await request(app)
      .post(`/tenants/${tenantId}/memberships`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ email: "nobody-registered@example.com", roleKey: "staff_basic" });
    expect(res.status).toBe(404);
  });
});
