import { storySchema } from "../shared/index.js";

import { asyncHandler } from "../utils/async-handler.js";
import { createStory, getPublicFeed } from "../services/story.service.js";

export const createStoryController = asyncHandler(async (request, response) => {
  const story = await createStory(request.auth!.userId, storySchema.parse(request.body));
  response.status(201).json(story);
});

export const publicFeedController = asyncHandler(async (_request, response) => {
  const feed = await getPublicFeed();
  response.status(200).json(feed);
});
