# admin-portal

The Super Admin Portal - tenant approval/moderation, platform settings, and
platform-wide analytics. Same login as the Merchant Portal (`/auth/login`);
access is gated on the logged-in user holding a `platform_admins` row
(`me.isPlatformAdmin`).

Run with `npm run dev --workspace=@fashion-platform/admin-portal` (default
port 5174) against a running `backend-api`.
