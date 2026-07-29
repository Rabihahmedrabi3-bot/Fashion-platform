import { Router } from "express";
import {
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  requestPasswordResetRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
  type LoginRequestInput,
  type LogoutRequestInput,
  type RefreshRequestInput,
  type RegisterRequestInput,
  type RequestPasswordResetRequestInput,
  type ResetPasswordRequestInput,
  type VerifyEmailRequestInput,
} from "@fashion-platform/validation";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { buildPasswordResetEmail, buildVerificationEmail } from "../lib/email.js";
import { ConflictError, GoneError, UnauthorizedError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
} from "../lib/tokens.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createRefreshTokensRepo } from "../repositories/refreshTokensRepo.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createVerificationTokensRepo } from "../repositories/verificationTokensRepo.js";

export function createAuthRouter(deps: AppDependencies): Router {
  const router = Router();
  const usersRepo = createUsersRepo(deps.db);
  const refreshTokensRepo = createRefreshTokensRepo(deps.db);
  const verificationTokensRepo = createVerificationTokensRepo(deps.db);

  async function issueSession(userId: string, tokenVersion: number) {
    const accessToken = await signAccessToken({ sub: userId, tokenVersion }, deps.jwtAccessSecret);
    const rawRefreshToken = generateOpaqueToken();
    await refreshTokensRepo.create(
      userId,
      hashOpaqueToken(rawRefreshToken, deps.refreshTokenHashPepper),
      new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    );
    return { accessToken, refreshToken: rawRefreshToken };
  }

  router.post(
    "/register",
    validateBody(registerRequestSchema),
    asyncHandler(async (req, res) => {
      const { email, password, fullName, phone } = req.body as RegisterRequestInput;

      const existing = await usersRepo.findByEmail(email);
      if (existing) {
        throw new ConflictError("an account with this email already exists");
      }
      if (phone) {
        const existingPhone = await usersRepo.findByPhone(phone);
        if (existingPhone) {
          throw new ConflictError("an account with this phone number already exists");
        }
      }

      const passwordHash = await hashPassword(password);
      const user = await usersRepo.create({ email, passwordHash, fullName, phone: phone ?? null });

      const rawToken = generateOpaqueToken();
      await verificationTokensRepo.create(
        user.id,
        hashOpaqueToken(rawToken, deps.refreshTokenHashPepper),
        "email_verification",
        new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      );
      await deps.emailProvider.send({ to: user.email, ...buildVerificationEmail(rawToken) });

      res.status(201).json({ id: user.id, email: user.email, status: user.status });
    }),
  );

  router.post(
    "/verify-email",
    validateBody(verifyEmailRequestSchema),
    asyncHandler(async (req, res) => {
      const { token } = req.body as VerifyEmailRequestInput;
      const tokenHash = hashOpaqueToken(token, deps.refreshTokenHashPepper);
      const record = await verificationTokensRepo.findUnusedByHash(tokenHash, "email_verification");
      if (!record || record.expiresAt.getTime() < Date.now()) {
        throw new GoneError("verification token expired or invalid");
      }

      await usersRepo.markEmailVerified(record.userId);
      await verificationTokensRepo.markUsed(record.id);
      res.status(200).json({ status: "verified" });
    }),
  );

  router.post(
    "/login",
    validateBody(loginRequestSchema),
    asyncHandler(async (req, res) => {
      const { email, phone, password } = req.body as LoginRequestInput;
      const user = email ? await usersRepo.findByEmail(email) : await usersRepo.findByPhone(phone!);
      if (!user || user.status !== "active" || !(await verifyPassword(user.passwordHash, password))) {
        throw new UnauthorizedError("invalid email/phone or password");
      }

      const session = await issueSession(user.id, user.tokenVersion);
      res.status(200).json(session);
    }),
  );

  router.post(
    "/refresh",
    validateBody(refreshRequestSchema),
    asyncHandler(async (req, res) => {
      const { refreshToken } = req.body as RefreshRequestInput;
      const tokenHash = hashOpaqueToken(refreshToken, deps.refreshTokenHashPepper);
      const record = await refreshTokensRepo.findActiveByHash(tokenHash);
      if (!record || record.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedError("invalid or expired refresh token");
      }

      const user = await usersRepo.findById(record.userId);
      if (!user || user.status !== "active") {
        throw new UnauthorizedError("invalid or expired refresh token");
      }

      // Rotate: the presented token is single-use.
      await refreshTokensRepo.revoke(record.id);
      const session = await issueSession(user.id, user.tokenVersion);
      res.status(200).json(session);
    }),
  );

  router.post(
    "/logout",
    requireAuth(deps),
    validateBody(logoutRequestSchema),
    asyncHandler(async (req, res) => {
      const { refreshToken } = req.body as LogoutRequestInput;
      const tokenHash = hashOpaqueToken(refreshToken, deps.refreshTokenHashPepper);
      const record = await refreshTokensRepo.findActiveByHash(tokenHash);
      if (record && record.userId === req.userId) {
        await refreshTokensRepo.revoke(record.id);
      }
      res.status(204).send();
    }),
  );

  router.post(
    "/request-password-reset",
    validateBody(requestPasswordResetRequestSchema),
    asyncHandler(async (req, res) => {
      const { email } = req.body as RequestPasswordResetRequestInput;
      const user = await usersRepo.findByEmail(email);
      // Always 200 regardless of whether the email exists - no enumeration.
      if (user) {
        const rawToken = generateOpaqueToken();
        await verificationTokensRepo.create(
          user.id,
          hashOpaqueToken(rawToken, deps.refreshTokenHashPepper),
          "password_reset",
          new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        );
        await deps.emailProvider.send({ to: user.email, ...buildPasswordResetEmail(rawToken) });
      }
      res.status(200).json({ status: "ok" });
    }),
  );

  router.post(
    "/reset-password",
    validateBody(resetPasswordRequestSchema),
    asyncHandler(async (req, res) => {
      const { token, newPassword } = req.body as ResetPasswordRequestInput;
      const tokenHash = hashOpaqueToken(token, deps.refreshTokenHashPepper);
      const record = await verificationTokensRepo.findUnusedByHash(tokenHash, "password_reset");
      if (!record || record.expiresAt.getTime() < Date.now()) {
        throw new GoneError("reset token expired or invalid");
      }

      const passwordHash = await hashPassword(newPassword);
      await usersRepo.updatePassword(record.userId, passwordHash);
      await verificationTokensRepo.markUsed(record.id);
      await refreshTokensRepo.revokeAllForUser(record.userId);

      res.status(200).json({ status: "ok" });
    }),
  );

  return router;
}
