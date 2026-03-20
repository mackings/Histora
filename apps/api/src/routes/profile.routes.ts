import { Router } from "express";

import {
  createInviteController,
  listInvitesController,
  savedStoriesController,
  listSessionsController,
  profileDashboardController,
  revokeInviteController,
  revokeSessionController,
  toggleFollowController,
  updateProfileController
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const profileRouter = Router();

profileRouter.get("/me", requireAuth, profileDashboardController);
profileRouter.patch("/me", requireAuth, updateProfileController);
profileRouter.get("/sessions", requireAuth, listSessionsController);
profileRouter.post("/sessions/:sessionId/revoke", requireAuth, revokeSessionController);
profileRouter.get("/invites", requireAuth, listInvitesController);
profileRouter.post("/invites", requireAuth, createInviteController);
profileRouter.delete("/invites/:inviteId", requireAuth, revokeInviteController);
profileRouter.get("/saved", requireAuth, savedStoriesController);
profileRouter.post("/follows/:username/toggle", requireAuth, toggleFollowController);

export { profileRouter };
