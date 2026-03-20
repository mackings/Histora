import { z } from "zod";

import { statusCreateSchema, statusReactionSchema } from "../shared/index.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  createStatus,
  deleteStatus,
  getAnonymousStatusByShareSlug,
  getMyStatuses,
  getStatusFeed,
  toggleStatusReaction
} from "../services/status.service.js";

export const getStatusFeedController = asyncHandler(async (_request, response) => {
  const statuses = await getStatusFeed();
  response.status(200).json(statuses);
});

export const createStatusController = asyncHandler(async (request, response) => {
  const status = await createStatus(request.auth!.userId, statusCreateSchema.parse(request.body));
  response.status(201).json(status);
});

export const getMyStatusesController = asyncHandler(async (request, response) => {
  const statuses = await getMyStatuses(request.auth!.userId);
  response.status(200).json(statuses);
});

export const getAnonymousStatusByShareSlugController = asyncHandler(async (request, response) => {
  const params = z.object({ shareSlug: z.string().min(1) }).parse(request.params);
  const status = await getAnonymousStatusByShareSlug(params.shareSlug);
  response.status(200).json(status);
});

export const toggleStatusReactionController = asyncHandler(async (request, response) => {
  const params = z.object({ statusId: z.string().min(1) }).parse(request.params);
  const body = statusReactionSchema.parse(request.body);
  const result = await toggleStatusReaction(params.statusId, request.auth!.userId, body.action);
  response.status(200).json(result);
});

export const deleteStatusController = asyncHandler(async (request, response) => {
  const params = z.object({ statusId: z.string().min(1) }).parse(request.params);
  const result = await deleteStatus(params.statusId, request.auth!.userId);
  response.status(200).json(result);
});
