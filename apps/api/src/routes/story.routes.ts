import { Router } from "express";

import {
  createStoryController,
  myStoriesController,
  myStoryController,
  publicFeedController,
  publicStoryController,
  toggleStoryReactionController,
  updateStoryController
} from "../controllers/story.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const storyRouter = Router();

storyRouter.get("/feed", publicFeedController);
storyRouter.get("/mine", requireAuth, myStoriesController);
storyRouter.get("/mine/:storyId", requireAuth, myStoryController);
storyRouter.get("/public/:slug", publicStoryController);
storyRouter.post("/", requireAuth, createStoryController);
storyRouter.patch("/:storyId", requireAuth, updateStoryController);
storyRouter.post("/:storyId/reactions", requireAuth, toggleStoryReactionController);

export { storyRouter };
