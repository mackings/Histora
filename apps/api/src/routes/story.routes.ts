import { Router } from "express";

import {
  createStoryController,
  myStoriesController,
  myStoryController,
  publicFeedController,
  publicStoryController,
  trackStoryShareController,
  toggleStoryReactionController,
  updateStoryController
} from "../controllers/story.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";

const storyRouter = Router();

storyRouter.get("/feed", optionalAuth, publicFeedController);
storyRouter.get("/mine", requireAuth, myStoriesController);
storyRouter.get("/mine/:storyId", requireAuth, myStoryController);
storyRouter.get("/public/:slug", optionalAuth, publicStoryController);
storyRouter.post("/", requireAuth, createStoryController);
storyRouter.patch("/:storyId", requireAuth, updateStoryController);
storyRouter.post("/:storyId/reactions", requireAuth, toggleStoryReactionController);
storyRouter.post("/:storyId/share", requireAuth, trackStoryShareController);

export { storyRouter };
