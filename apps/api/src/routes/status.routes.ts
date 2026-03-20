import { Router } from "express";

import {
  createStatusController,
  getAnonymousStatusByShareSlugController,
  getMyStatusesController,
  getStatusFeedController,
  toggleStatusReactionController
} from "../controllers/status.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const statusRouter = Router();

statusRouter.get("/mine", requireAuth, getMyStatusesController);
statusRouter.get("/share/:shareSlug", getAnonymousStatusByShareSlugController);
statusRouter.get("/", getStatusFeedController);
statusRouter.post("/", requireAuth, createStatusController);
statusRouter.post("/:statusId/reactions", requireAuth, toggleStatusReactionController);

export { statusRouter };
