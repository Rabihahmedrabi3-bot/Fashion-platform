import type { Express } from "express";
import request from "supertest";
import { SYSTEM_ROLE_KEYS } from "@fashion-platform/shared-types";
import { platformAdmins } from "../../src/db/schema.js";
import { createRolesRepo } from "../../src/repositories/rolesRepo.js";
import { getTestDb } from "./db.js";
import type { TestEmailProvider } from "./testEmailProvider.js";

let counter = 0;
export function uniqueSlug(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export interface RegisteredUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerVerifiedUser(
  app: Express,
  emailProvider: TestEmailProvider,
  overrides: Partial<{ email: string; password: string; fullName: string }> = {},
): Promise<RegisteredUser> {
  const email = overrides.email ?? `${uniqueSlug("user")}@example.com`;
  const password = overrides.password ?? "correct-horse-battery-staple";
  const fullName = overrides.fullName ?? "Test User";

  await request(app).post("/auth/register").send({ email, password, fullName }).expect(201);
  const token = emailProvider.lastToken(email);
  await request(app).post("/auth/verify-email").send({ token }).expect(200);

  const loginRes = await request(app).post("/auth/login").send({ email, password }).expect(200);
  const meRes = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${loginRes.body.accessToken as string}`)
    .expect(200);

  return {
    id: meRes.body.user.id as string,
    email,
    password,
    accessToken: loginRes.body.accessToken as string,
    refreshToken: loginRes.body.refreshToken as string,
  };
}

export interface CreatedTenant {
  tenantId: string;
  storeId: string;
  slug: string;
}

export async function createTenantForOwner(
  app: Express,
  owner: Pick<RegisteredUser, "accessToken">,
  overrides: Partial<{ name: string; slug: string }> = {},
): Promise<CreatedTenant> {
  const slug = overrides.slug ?? uniqueSlug("store");
  const name = overrides.name ?? `Test Store ${slug}`;

  const res = await request(app)
    .post("/tenants")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ name, slug })
    .expect(201);

  return { tenantId: res.body.tenant.id as string, storeId: res.body.store.id as string, slug };
}

/** Bootstraps platform-admin authority directly (mirrors what the seed script does) - there is no self-service endpoint for this by design. */
export async function makePlatformAdmin(userId: string): Promise<void> {
  const db = getTestDb();
  const rolesRepo = createRolesRepo(db);
  const role = await rolesRepo.findSystemRoleByKey(SYSTEM_ROLE_KEYS.SUPER_ADMIN);
  if (!role) throw new Error("super_admin role not seeded - check globalSetup");
  await db.insert(platformAdmins).values({ userId, roleId: role.id }).onConflictDoNothing();
}

/** Approves `tenantId` (status pending_approval -> active) via a freshly-bootstrapped admin - needed for anything that touches the public storefront, since it only ever serves active stores. */
export async function approveTenant(
  app: Express,
  emailProvider: TestEmailProvider,
  tenantId: string,
): Promise<void> {
  const admin = await registerVerifiedUser(app, emailProvider);
  await makePlatformAdmin(admin.id);
  await request(app)
    .post(`/admin/tenants/${tenantId}/approve`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200);
}

/** Invites `staff` into `tenantId` under `roleKey` and immediately activates the membership, using the Owner's token. */
export async function inviteAndActivateStaff(
  app: Express,
  owner: Pick<RegisteredUser, "accessToken">,
  tenantId: string,
  staff: Pick<RegisteredUser, "email">,
  roleKey: string,
): Promise<string> {
  const inviteRes = await request(app)
    .post(`/tenants/${tenantId}/memberships`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ email: staff.email, roleKey })
    .expect(201);

  await request(app)
    .patch(`/tenants/${tenantId}/memberships/${inviteRes.body.id}`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ status: "active" })
    .expect(200);

  return inviteRes.body.id as string;
}
