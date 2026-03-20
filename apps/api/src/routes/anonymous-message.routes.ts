import { Router } from "express";

import {
  createAnonymousMessageController,
  getAnonymousRecipientMessageController,
  getAnonymousMessageController,
  listAnonymousInboxController,
  listSentAnonymousMessagesController,
  unlockAnonymousHelperContactController,
  updateAnonymousDistributionController
} from "../controllers/anonymous-message.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const anonymousMessageRouter = Router();

anonymousMessageRouter.post("/", requireAuth, createAnonymousMessageController);
anonymousMessageRouter.get("/inbox", requireAuth, listAnonymousInboxController);
anonymousMessageRouter.get("/sent", requireAuth, listSentAnonymousMessagesController);
anonymousMessageRouter.get("/:shareSlug/private", requireAuth, getAnonymousRecipientMessageController);
anonymousMessageRouter.get("/:shareSlug", getAnonymousMessageController);
anonymousMessageRouter.patch("/:messageId/distribution", requireAuth, updateAnonymousDistributionController);
anonymousMessageRouter.post("/:messageId/helper-contact/unlock", requireAuth, unlockAnonymousHelperContactController);

export { anonymousMessageRouter };
