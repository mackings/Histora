import express, { Router } from "express";
import * as rateLimitModule from "express-rate-limit";

import { createAssemblyStreamingTokenController, createTranscriptionController } from "../controllers/transcription.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getRateLimitStore } from "../services/rate-limit.service.js";

const transcriptionRouter = Router();
const rateLimit = ("default" in rateLimitModule
  ? rateLimitModule.default
  : (rateLimitModule as unknown as { rateLimit: typeof import("express-rate-limit").default }).rateLimit) as typeof import("express-rate-limit").default;

transcriptionRouter.get(
  "/token",
  requireAuth,
  rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
    ,
    store: getRateLimitStore()
  }),
  createAssemblyStreamingTokenController
);

transcriptionRouter.post(
  "/",
  requireAuth,
  rateLimit({
    windowMs: 60 * 1000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    store: getRateLimitStore()
  }),
  express.raw({
    type: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"],
    limit: "25mb"
  }),
  createTranscriptionController
);

export { transcriptionRouter };
