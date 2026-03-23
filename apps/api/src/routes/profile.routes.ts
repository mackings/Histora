import { Router } from "express";

import {
  acceptInviteController,
  createInviteController,
  listDevicesController,
  listFollowersController,
  listFollowingController,
  listIncomingInvitesController,
  listInvitesController,
  pushPublicKeyController,
  requestVerificationController,
  revokePushSubscriptionController,
  savedStoriesController,
  savePushSubscriptionController,
  listSessionsController,
  profileDashboardController,
  renameDeviceController,
  revokeInviteController,
  revokeDeviceController,
  revokeSessionController,
  toggleFollowController,
  toggleStoryAuthorFollowController,
  updateProfileController
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const profileRouter = Router();

profileRouter.get("/me", requireAuth, profileDashboardController);
profileRouter.patch("/me", requireAuth, updateProfileController);
profileRouter.get("/sessions", requireAuth, listSessionsController);
profileRouter.post("/sessions/:sessionId/revoke", requireAuth, revokeSessionController);
profileRouter.get("/devices", requireAuth, listDevicesController);
profileRouter.patch("/devices/:deviceId", requireAuth, renameDeviceController);
profileRouter.post("/devices/:deviceId/revoke", requireAuth, revokeDeviceController);
profileRouter.get("/push/public-key", requireAuth, pushPublicKeyController);
profileRouter.post("/push/subscriptions", requireAuth, savePushSubscriptionController);
profileRouter.delete("/push/subscriptions", requireAuth, revokePushSubscriptionController);
profileRouter.get("/invites", requireAuth, listInvitesController);
profileRouter.get("/invites/incoming", requireAuth, listIncomingInvitesController);
profileRouter.post("/invites", requireAuth, createInviteController);
profileRouter.post("/invites/:inviteId/accept", requireAuth, acceptInviteController);
profileRouter.delete("/invites/:inviteId", requireAuth, revokeInviteController);
profileRouter.get("/saved", requireAuth, savedStoriesController);
profileRouter.post("/verification/request", requireAuth, requestVerificationController);
profileRouter.get("/followers", requireAuth, listFollowersController);
profileRouter.get("/following", requireAuth, listFollowingController);
profileRouter.post("/follows/story/:storyId/toggle", requireAuth, toggleStoryAuthorFollowController);
profileRouter.post("/follows/:username/toggle", requireAuth, toggleFollowController);

export { profileRouter };
