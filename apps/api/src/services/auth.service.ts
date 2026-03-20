import crypto from "crypto";

import bcrypt from "bcryptjs";
import type { CookieOptions } from "express";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";

import type {
  EmailVerificationRequestInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignUpInput,
  VerifyEmailInput
} from "../shared/index.js";
import { env } from "../config/env.js";
import { EmailVerificationTokenModel } from "../models/email-verification-token.model.js";
import { PasswordResetTokenModel } from "../models/password-reset-token.model.js";
import { SessionModel } from "../models/session.model.js";
import { UserModel } from "../models/user.model.js";
import { recordAuditEvent } from "./audit.service.js";
import { sendVerificationOtpEmail } from "./email.service.js";
import { AppError } from "../utils/app-error.js";

const accessTokenTtl = env.ACCESS_TOKEN_TTL;
const refreshTokenTtlDays = env.REFRESH_TOKEN_TTL_DAYS;
const refreshTokenTtl = `${refreshTokenTtlDays}d` as SignOptions["expiresIn"];

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type AuthPayload = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    fullName: string;
    username: string;
    email: string;
    subscriptionTier: "free" | "premium";
  };
};

type VerificationRequestResult = {
  ok: true;
  email: string;
  verificationRequired: true;
};

const buildAccessToken = (userId: string) =>
  jwt.sign({ sub: userId, typ: "access" }, env.JWT_SECRET, {
    expiresIn: accessTokenTtl as SignOptions["expiresIn"]
  });

const buildRefreshToken = (sessionId: string, userId: string) =>
  jwt.sign(
    { sub: userId, sid: sessionId, typ: "refresh" },
    env.JWT_REFRESH_SECRET ?? env.JWT_SECRET,
    { expiresIn: refreshTokenTtl }
  );

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const buildResetCode = () => crypto.randomBytes(3).toString("hex").toUpperCase();
const buildVerificationOtp = () => crypto.randomInt(10000, 100000).toString();

export function buildCookieOptions(): CookieOptions {
  const sameSite = env.NODE_ENV === "production" ? "none" : "lax";

  return {
    httpOnly: true,
    sameSite,
    secure: env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: refreshTokenTtlDays * 24 * 60 * 60 * 1000
  };
}

async function createSessionPayload(userId: string, context?: RequestContext): Promise<AuthPayload> {
  const user = await UserModel.findById(userId).select("fullName username email subscriptionTier emailVerified");
  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.emailVerified) {
    throw new AppError("Verify your email before continuing.", 403, "EMAIL_NOT_VERIFIED");
  }

  const session = await SessionModel.create({
    userId,
    tokenHash: "pending",
    userAgent: context?.userAgent,
    ipAddress: context?.ipAddress,
    expiresAt: new Date(Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000),
    lastSeenAt: new Date()
  });

  const refreshToken = buildRefreshToken(session.id, userId);
  session.tokenHash = hashToken(refreshToken);
  await session.save();

  return {
    accessToken: buildAccessToken(userId),
    refreshToken,
    user: {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      subscriptionTier: user.subscriptionTier
    }
  };
}

export async function registerUser(payload: SignUpInput, context?: RequestContext) {
  const email = payload.email.toLowerCase();
  const existing = await UserModel.findOne({
    $or: [{ email }, { username: payload.username }]
  });

  if (existing) {
    throw new AppError("Email or username already exists", 409);
  }

  const passwordHash = await bcrypt.hash(payload.password, 12);
  const user = await UserModel.create({
    fullName: payload.fullName,
    username: payload.username,
    email,
    passwordHash,
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined
  });

  await issueEmailVerificationOtp(user.id, user.email);
  await recordAuditEvent({
    actorUserId: user.id,
    targetUserId: user.id,
    entityType: "auth",
    entityId: user.id,
    action: "register.success"
  });

  return {
    ok: true,
    email: user.email,
    verificationRequired: true
  } satisfies VerificationRequestResult;
}

export async function loginUser(payload: LoginInput, context?: RequestContext) {
  const user = await UserModel.findOne({ email: payload.email.toLowerCase() });
  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const isValidPassword = await bcrypt.compare(payload.password, user.passwordHash);
  if (!isValidPassword) {
    throw new AppError("Invalid credentials", 401);
  }

  if (!user.emailVerified) {
    throw new AppError("Verify your email before signing in.", 403, "EMAIL_NOT_VERIFIED");
  }

  const sessionPayload = await createSessionPayload(user.id, context);
  await recordAuditEvent({
    actorUserId: user.id,
    targetUserId: user.id,
    entityType: "auth",
    entityId: user.id,
    action: "login.success"
  });

  return sessionPayload;
}

export async function getAuthenticatedUser(userId: string) {
  const user = await UserModel.findById(userId).select("fullName username email subscriptionTier emailVerified");
  if (!user) {
    throw new AppError("User not found", 404);
  }

  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    subscriptionTier: user.subscriptionTier,
    emailVerified: user.emailVerified
  };
}

async function issueEmailVerificationOtp(userId: string, email: string) {
  const existingRecentToken = await EmailVerificationTokenModel.findOne({
    userId,
    consumedAt: null,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  if (existingRecentToken && Date.now() - existingRecentToken.createdAt.getTime() < 60_000) {
    throw new AppError("Please wait a minute before requesting another code.", 429, "VERIFICATION_RESEND_COOLDOWN");
  }

  await EmailVerificationTokenModel.deleteMany({ userId, consumedAt: null });

  const otp = buildVerificationOtp();
  await EmailVerificationTokenModel.create({
    userId,
    email,
    codeHash: hashToken(otp),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });

  await sendVerificationOtpEmail(email, otp);
}

export async function resendEmailVerification(payload: EmailVerificationRequestInput) {
  const user = await UserModel.findOne({ email: payload.email.toLowerCase() });
  if (!user) {
    return { ok: true };
  }

  if (user.emailVerified) {
    return { ok: true, alreadyVerified: true };
  }

  await issueEmailVerificationOtp(user.id, user.email);
  await recordAuditEvent({
    actorUserId: user.id,
    targetUserId: user.id,
    entityType: "auth",
    entityId: user.id,
    action: "email-verification.resent"
  });

  return {
    ok: true,
    email: user.email,
    verificationRequired: true
  };
}

export async function verifyEmailAddress(payload: VerifyEmailInput) {
  const email = payload.email.toLowerCase();
  const user = await UserModel.findOne({ email });
  if (!user) {
    throw new AppError("Verification code is invalid or expired.", 400, "INVALID_VERIFICATION_CODE");
  }

  const token = await EmailVerificationTokenModel.findOne({
    userId: user.id,
    email,
    codeHash: hashToken(payload.otp),
    consumedAt: null,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  if (!token) {
    throw new AppError("Verification code is invalid or expired.", 400, "INVALID_VERIFICATION_CODE");
  }

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save();

  token.consumedAt = new Date();
  await token.save();
  await EmailVerificationTokenModel.deleteMany({ userId: user.id, consumedAt: null });

  await recordAuditEvent({
    actorUserId: user.id,
    targetUserId: user.id,
    entityType: "auth",
    entityId: user.id,
    action: "email-verification.completed"
  });

  return {
    ok: true,
    email
  };
}

export async function refreshAccessToken(refreshToken: string, context?: RequestContext) {
  if (!refreshToken) {
    throw new AppError("Refresh token is required", 401);
  }

  let payload: { sub: string; sid: string; typ: string };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET ?? env.JWT_SECRET) as {
      sub: string;
      sid: string;
      typ: string;
    };
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  if (payload.typ !== "refresh") {
    throw new AppError("Invalid refresh token payload", 401);
  }

  const session = await SessionModel.findById(payload.sid);
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    throw new AppError("Refresh session is no longer valid", 401);
  }

  if (session.tokenHash !== hashToken(refreshToken)) {
    await SessionModel.updateMany({ family: session.family }, { $set: { revokedAt: new Date() } });
    throw new AppError("Refresh token reuse detected", 401);
  }

  const nextSession = await SessionModel.create({
    userId: payload.sub,
    tokenHash: "pending",
    family: session.family,
    parentSessionId: session._id,
    userAgent: context?.userAgent ?? session.userAgent,
    ipAddress: context?.ipAddress ?? session.ipAddress,
    expiresAt: new Date(Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000),
    lastSeenAt: new Date()
  });
  const nextRefreshToken = buildRefreshToken(nextSession.id, payload.sub);
  nextSession.tokenHash = hashToken(nextRefreshToken);
  await nextSession.save();

  session.revokedAt = new Date();
  session.lastSeenAt = new Date();
  await session.save();

  const user = await getAuthenticatedUser(payload.sub);
  await recordAuditEvent({
    actorUserId: payload.sub,
    targetUserId: payload.sub,
    entityType: "session",
    entityId: nextSession.id,
    action: "refresh.success"
  });

  return {
    accessToken: buildAccessToken(payload.sub),
    refreshToken: nextRefreshToken,
    user
  };
}

export async function logoutSession(refreshToken: string | undefined) {
  if (!refreshToken) {
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET ?? env.JWT_SECRET) as {
      sid: string;
      sub: string;
      typ: string;
    };
    await SessionModel.findByIdAndUpdate(payload.sid, { $set: { revokedAt: new Date() } });
    await recordAuditEvent({
      actorUserId: payload.sub,
      targetUserId: payload.sub,
      entityType: "session",
      entityId: payload.sid,
      action: "logout.success"
    });
  } catch {
    return;
  }
}

export async function createPasswordResetRequest(payload: ForgotPasswordInput) {
  const user = await UserModel.findOne({ email: payload.email.toLowerCase() });
  if (!user) {
    return { ok: true };
  }

  const rawCode = buildResetCode();
  await PasswordResetTokenModel.create({
    userId: user.id,
    codeHash: hashToken(rawCode),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
  });

  await recordAuditEvent({
    actorUserId: user.id,
    targetUserId: user.id,
    entityType: "auth",
    entityId: user.id,
    action: "password-reset.requested"
  });

  return {
    ok: true,
    resetCode: env.NODE_ENV === "production" ? undefined : rawCode
  };
}

export async function resetPassword(payload: ResetPasswordInput) {
  const codeHash = hashToken(payload.code.trim().toUpperCase());
  const resetToken = await PasswordResetTokenModel.findOne({
    codeHash,
    usedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!resetToken) {
    throw new AppError("Reset code is invalid or expired", 400);
  }

  const user = await UserModel.findById(resetToken.userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  user.passwordHash = await bcrypt.hash(payload.password, 12);
  await user.save();

  resetToken.usedAt = new Date();
  await resetToken.save();
  await SessionModel.updateMany({ userId: user.id, revokedAt: null }, { $set: { revokedAt: new Date() } });

  await recordAuditEvent({
    actorUserId: user.id,
    targetUserId: user.id,
    entityType: "auth",
    entityId: user.id,
    action: "password-reset.completed"
  });

  return { ok: true };
}
