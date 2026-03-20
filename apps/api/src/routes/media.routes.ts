import express, { Router } from "express";

import {
  createSignedReadController,
  createSignedUploadController,
  uploadMediaDirectController
} from "../controllers/media.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const mediaRouter = Router();

mediaRouter.post("/signed-upload", requireAuth, createSignedUploadController);
mediaRouter.post("/upload", requireAuth, express.raw({ type: "*/*", limit: "32mb" }), uploadMediaDirectController);
mediaRouter.get("/signed-read", requireAuth, createSignedReadController);

export { mediaRouter };
