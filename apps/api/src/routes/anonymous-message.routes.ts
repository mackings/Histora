import { Router } from "express";

import {
  acceptAnonymousHelpRequestController,
  createAnonymousMessageController,
  deleteAnonymousMessageController,
  getAnonymousRecipientMessageController,
  getAnonymousMessageController,
  listAnonymousInboxController,
  listSentAnonymousMessagesController,
  requestAnonymousHelpController,
  unlockAnonymousHelperContactController,
  updateAnonymousDistributionController
} from "../controllers/anonymous-message.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";

const anonymousMessageRouter = Router();

anonymousMessageRouter.post("/", requireAuth, createAnonymousMessageController);
anonymousMessageRouter.get("/inbox", requireAuth, listAnonymousInboxController);
anonymousMessageRouter.get("/sent", requireAuth, listSentAnonymousMessagesController);
anonymousMessageRouter.get("/:shareSlug/private", requireAuth, getAnonymousRecipientMessageController);
anonymousMessageRouter.get("/:shareSlug", optionalAuth, getAnonymousMessageController);
anonymousMessageRouter.post("/:shareSlug/help-requests", requireAuth, requestAnonymousHelpController);
anonymousMessageRouter.patch("/:messageId/distribution", requireAuth, updateAnonymousDistributionController);
anonymousMessageRouter.post("/:messageId/help-requests/:requestId/accept", requireAuth, acceptAnonymousHelpRequestController);
anonymousMessageRouter.post("/:messageId/helper-contact/unlock", requireAuth, unlockAnonymousHelperContactController);
anonymousMessageRouter.delete("/:messageId", requireAuth, deleteAnonymousMessageController);

export { anonymousMessageRouter };
