import { Router } from "express";

import { createStoryController, publicFeedController } from "../controllers/story.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const storyRouter = Router();

storyRouter.get("/feed", publicFeedController);
storyRouter.post("/", requireAuth, createStoryController);

export { storyRouter };
