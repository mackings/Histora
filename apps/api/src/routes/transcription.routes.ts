import express, { Router } from "express";
import * as rateLimitModule from "express-rate-limit";

import { createAssemblyStreamingTokenController, createTranscriptionController } from "../controllers/transcription.controller.js";

const transcriptionRouter = Router();
const rateLimit = ("default" in rateLimitModule
  ? rateLimitModule.default
  : (rateLimitModule as unknown as { rateLimit: typeof import("express-rate-limit").default }).rateLimit) as typeof import("express-rate-limit").default;

transcriptionRouter.get(
  "/token",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false
  }),
  createAssemblyStreamingTokenController
);

transcriptionRouter.post(
  "/",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false
  }),
  express.raw({
    type: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"],
    limit: "25mb"
  }),
  createTranscriptionController
);

export { transcriptionRouter };
