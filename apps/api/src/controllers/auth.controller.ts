import type { Request, Response } from "express";

import {
  emailVerificationRequestSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
  verifyEmailSchema
} from "../shared/index.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  buildCookieOptions,
  createPasswordResetRequest,
  getAuthenticatedUser,
  loginUser,
  logoutSession,
  resendEmailVerification,
  refreshAccessToken,
  registerUser,
  resetPassword,
  verifyEmailAddress
} from "../services/auth.service.js";

const getRequestContext = (request: Request) => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent") ?? undefined
});

const applySensitiveResponseHeaders = (response: Response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
};

const appendRefreshCookie = (response: Response, refreshToken: string) => {
  response.cookie(env.REFRESH_COOKIE_NAME, refreshToken, buildCookieOptions());
};

const clearRefreshCookie = (response: Response) => {
  response.clearCookie(env.REFRESH_COOKIE_NAME, buildCookieOptions());
};

export const registerController = asyncHandler(async (request, response) => {
  const result = await registerUser(signUpSchema.parse(request.body), getRequestContext(request));
  applySensitiveResponseHeaders(response);
  response.status(201).json(result);
});

export const loginController = asyncHandler(async (request, response) => {
  const result = await loginUser(loginSchema.parse(request.body), getRequestContext(request));
  applySensitiveResponseHeaders(response);
  appendRefreshCookie(response, result.refreshToken);
  response.status(200).json({
    accessToken: result.accessToken,
    user: result.user
  });
});

export const meController = asyncHandler(async (request, response) => {
  applySensitiveResponseHeaders(response);
  response.status(200).json({
    user: await getAuthenticatedUser(request.auth!.userId)
  });
});

export const refreshController = asyncHandler(async (request, response) => {
  const refreshToken = request.cookies?.[env.REFRESH_COOKIE_NAME];
  const result = await refreshAccessToken(refreshToken, getRequestContext(request));
  applySensitiveResponseHeaders(response);
  appendRefreshCookie(response, result.refreshToken);
  response.status(200).json({
    accessToken: result.accessToken,
    user: result.user
  });
});

export const logoutController = asyncHandler(async (request, response) => {
  const refreshToken = request.cookies?.[env.REFRESH_COOKIE_NAME];
  await logoutSession(refreshToken);
  applySensitiveResponseHeaders(response);
  clearRefreshCookie(response);
  response.status(204).send();
});

export const forgotPasswordController = asyncHandler(async (request, response) => {
  const result = await createPasswordResetRequest(forgotPasswordSchema.parse(request.body));
  response.status(200).json(result);
});

export const resendVerificationController = asyncHandler(async (request, response) => {
  const result = await resendEmailVerification(emailVerificationRequestSchema.parse(request.body));
  response.status(200).json(result);
});

export const verifyEmailController = asyncHandler(async (request, response) => {
  const result = await verifyEmailAddress(
    verifyEmailSchema.parse({
      email: request.body.email,
      otp: request.body.otp ?? request.body.code
    })
  );
  response.status(200).json(result);
});

export const resetPasswordController = asyncHandler(async (request, response) => {
  const result = await resetPassword(
    resetPasswordSchema.parse({
      code: request.body.resetCode ?? request.body.code,
      password: request.body.newPassword ?? request.body.password
    })
  );
  applySensitiveResponseHeaders(response);
  clearRefreshCookie(response);
  response.status(200).json(result);
});
