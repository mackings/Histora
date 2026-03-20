import { Router } from "express";

import {
  createStatusController,
  getStatusFeedController,
  toggleStatusReactionController
} from "../controllers/status.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const statusRouter = Router();

statusRouter.get("/", getStatusFeedController);
statusRouter.post("/", requireAuth, createStatusController);
statusRouter.post("/:statusId/reactions", requireAuth, toggleStatusReactionController);

export { statusRouter };
