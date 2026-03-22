import express, { Router } from "express";
import * as rateLimitModule from "express-rate-limit";

import {
  createSignedReadController,
  createSignedUploadController,
  uploadMediaDirectController
} from "../controllers/media.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getRateLimitStore } from "../services/rate-limit.service.js";

const mediaRouter = Router();
const rateLimit = ("default" in rateLimitModule
  ? rateLimitModule.default
  : (rateLimitModule as unknown as { rateLimit: typeof import("express-rate-limit").default }).rateLimit) as typeof import("express-rate-limit").default;
const mediaWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore("histora:rate-limit:media-write:")
});

mediaRouter.post("/signed-upload", requireAuth, mediaWriteLimiter, createSignedUploadController);
mediaRouter.post("/upload", requireAuth, mediaWriteLimiter, express.raw({ type: "*/*", limit: "32mb" }), uploadMediaDirectController);
mediaRouter.get("/signed-read", requireAuth, createSignedReadController);

export { mediaRouter };
