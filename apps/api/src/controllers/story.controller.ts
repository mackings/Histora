import { z } from "zod";

import { storyReactionSchema, storySaveSchema } from "../shared/index.js";

import { asyncHandler } from "../utils/async-handler.js";
import {
  getCollaborativeStories,
  getMyStories,
  getMyStory,
  getPublicFeed,
  getStoryBySlug,
  saveStory,
  trackStoryShare,
  toggleStoryReaction
} from "../services/story.service.js";

export const createStoryController = asyncHandler(async (request, response) => {
  const story = await saveStory(request.auth!.userId, storySaveSchema.parse(request.body));
  response.status(201).json(story);
});

export const updateStoryController = asyncHandler(async (request, response) => {
  const params = z.object({ storyId: z.string().min(1) }).parse(request.params);
  const story = await saveStory(request.auth!.userId, storySaveSchema.parse(request.body), params.storyId);
  response.status(200).json(story);
});

export const myStoriesController = asyncHandler(async (request, response) => {
  const stories = await getMyStories(request.auth!.userId);
  response.status(200).json(stories);
});

export const collaborativeStoriesController = asyncHandler(async (request, response) => {
  const stories = await getCollaborativeStories(request.auth!.userId);
  response.status(200).json(stories);
});

export const myStoryController = asyncHandler(async (request, response) => {
  const params = z.object({ storyId: z.string().min(1) }).parse(request.params);
  const story = await getMyStory(request.auth!.userId, params.storyId);
  response.status(200).json(story);
});

export const publicFeedController = asyncHandler(async (request, response) => {
  const feed = await getPublicFeed(request.auth?.userId);
  response.status(200).json(feed);
});

export const publicStoryController = asyncHandler(async (request, response) => {
  const params = z.object({ slug: z.string().min(1) }).parse(request.params);
  const story = await getStoryBySlug(params.slug, request.auth?.userId);
  response.status(200).json(story);
});

export const toggleStoryReactionController = asyncHandler(async (request, response) => {
  const params = z.object({ storyId: z.string().min(1) }).parse(request.params);
  const body = storyReactionSchema.parse(request.body);
  const result = await toggleStoryReaction(params.storyId, request.auth!.userId, body.action);
  response.status(200).json(result);
});

export const trackStoryShareController = asyncHandler(async (request, response) => {
  const params = z.object({ storyId: z.string().min(1) }).parse(request.params);
  const result = await trackStoryShare(params.storyId, request.auth!.userId);
  response.status(200).json(result);
});
