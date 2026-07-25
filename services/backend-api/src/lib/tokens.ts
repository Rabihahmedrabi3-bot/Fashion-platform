import { randomBytes, createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface AccessTokenPayload {
  sub: string;
  tokenVersion: number;
}

/**
 * Deliberately carries only userId + tokenVersion, never tenant/role claims
 * (docs/milestone-0-implementation-spec.md §7): a revoked staff membership
 * or role change must take effect on the next request, not up to 15 minutes
 * later, so tenant context is always resolved fresh from the DB per request.
 */
export async function signAccessToken(payload: AccessTokenPayload, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ tokenVersion: payload.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenPayload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.sub !== "string" || typeof payload.tokenVersion !== "number") {
      return null;
    }
    return { sub: payload.sub, tokenVersion: payload.tokenVersion };
  } catch {
    return null;
  }
}

/** High-entropy opaque token for refresh/verification/reset flows - never stored raw. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Deterministic HMAC, not argon2: these tokens are already 256 bits of
 * randomness (unlike user passwords), so a slow adaptive hash isn't needed
 * for brute-force resistance, and a deterministic digest lets the DB look
 * the token up by an indexed equality match.
 */
export function hashOpaqueToken(rawToken: string, pepper: string): string {
  return createHmac("sha256", pepper).update(rawToken).digest("hex");
}
