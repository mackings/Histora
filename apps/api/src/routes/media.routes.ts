import { Router } from "express";

import {
  createSignedReadController,
  createSignedUploadController
} from "../controllers/media.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const mediaRouter = Router();

mediaRouter.post("/signed-upload", requireAuth, createSignedUploadController);
mediaRouter.get("/signed-read", requireAuth, createSignedReadController);

export { mediaRouter };
