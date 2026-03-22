import { z } from "zod";

import { commentCreateSchema, commentTargetTypeSchema } from "../shared/index.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createComment, listComments } from "../services/comment.service.js";

export const createCommentController = asyncHandler(async (request, response) => {
  const comment = await createComment(request.auth!.userId, commentCreateSchema.parse(request.body));
  response.status(201).json(comment);
});

export const listCommentsController = asyncHandler(async (request, response) => {
  const query = z.object({
    targetType: commentTargetTypeSchema,
    targetId: z.string().min(1),
    shareSlug: z.string().min(1).optional()
  }).parse(request.query);

  const comments = await listComments(query.targetType, query.targetId, request.auth?.userId, query.shareSlug);
  response.status(200).json(comments);
});
