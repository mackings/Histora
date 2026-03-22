import { Router } from "express";
import * as rateLimitModule from "express-rate-limit";

import {
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  refreshController,
  registerController,
  resendDeviceVerificationController,
  resendVerificationController,
  resetPasswordController,
  verifyDeviceController,
  verifyEmailController
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireTrustedBrowserOrigin } from "../middleware/origin-protection.middleware.js";
import { getRateLimitStore } from "../services/rate-limit.service.js";

const authRouter = Router();
const rateLimit = ("default" in rateLimitModule
  ? rateLimitModule.default
  : (rateLimitModule as unknown as { rateLimit: typeof import("express-rate-limit").default }).rateLimit) as typeof import("express-rate-limit").default;
const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore("histora:rate-limit:auth-write:")
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore("histora:rate-limit:auth-login:")
});
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore("histora:rate-limit:auth-recovery:")
});
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore("histora:rate-limit:auth-verification:")
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore("histora:rate-limit:auth-refresh:")
});

authRouter.post("/register", requireTrustedBrowserOrigin, authWriteLimiter, registerController);
authRouter.post("/login", requireTrustedBrowserOrigin, loginLimiter, loginController);
authRouter.get("/me", requireAuth, meController);
authRouter.post("/refresh", requireTrustedBrowserOrigin, refreshLimiter, refreshController);
authRouter.post("/logout", requireTrustedBrowserOrigin, refreshLimiter, logoutController);
authRouter.post("/forgot-password", requireTrustedBrowserOrigin, recoveryLimiter, forgotPasswordController);
authRouter.post("/reset-password", requireTrustedBrowserOrigin, recoveryLimiter, resetPasswordController);
authRouter.post("/verify-email", requireTrustedBrowserOrigin, verificationLimiter, verifyEmailController);
authRouter.post("/resend-verification", requireTrustedBrowserOrigin, verificationLimiter, resendVerificationController);
authRouter.post("/verify-device", requireTrustedBrowserOrigin, verificationLimiter, verifyDeviceController);
authRouter.post("/resend-device-verification", requireTrustedBrowserOrigin, verificationLimiter, resendDeviceVerificationController);

export { authRouter };
