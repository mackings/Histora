import type { CommentCreateInput } from "../shared/index.js";

import { AnonymousMessageModel } from "../models/anonymous-message.model.js";
import { CommentModel } from "../models/comment.model.js";
import { StatusModel } from "../models/status.model.js";
import { StoryModel } from "../models/story.model.js";
import { UserModel } from "../models/user.model.js";
import { deleteCache, deleteCacheByPrefix, readJsonCache, writeJsonCache } from "./cache.service.js";
import { broadcastAppEvent } from "../realtime/app-events.js";
import { enqueueCounterSync } from "./queue.service.js";
import { AppError } from "../utils/app-error.js";

const getAnonymousInboxChannel = (recipientUserId: string) => `anonymous:inbox:${recipientUserId}`;

export async function createComment(userId: string, payload: CommentCreateInput) {
  const user = await UserModel.findById(userId).select("fullName username");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  let broadcastChannel = "feed";

  if (payload.targetType === "status") {
    const status = await StatusModel.findById(payload.targetId);

    if (!status) {
      throw new AppError("Status not found", 404);
    }

    status.commentsCount += 1;
    await status.save();
    await deleteCache("statuses:feed");
    await enqueueCounterSync("status", status.id);
  } else if (payload.targetType === "storyChapter") {
    const [storyId, chapterId] = payload.targetId.split(":");
    const story = await StoryModel.findById(storyId).select("chapters slug authorId");

    // The frontend uses storyId:chapterId, so validate the pair before accepting comments.
    if (!story || !chapterId || !story.chapters.some((chapter) => chapter.order.toString() === chapterId || chapter.title === chapterId)) {
      throw new AppError("Story chapter not found", 404);
    }
    await enqueueCounterSync("story", story.id);
    await deleteCache("stories:feed");
    await deleteCache(`stories:public:${story.slug}`);
    await deleteCacheByPrefix(`stories:mine:${story.authorId?.toString?.() ?? ""}`);
  } else {
    const message = await AnonymousMessageModel.findById(payload.targetId);

    if (!message) {
      throw new AppError("Anonymous message not found", 404);
    }

    message.commentsCount += 1;
    await message.save();
    await enqueueCounterSync("anonymousMessage", message.id);
    broadcastChannel = getAnonymousInboxChannel(message.recipientUserId.toString());
  }

  const comment = await CommentModel.create({
    targetType: payload.targetType,
    targetId: payload.targetId,
    authorId: userId,
    authorName: user.fullName,
    authorUsername: user.username,
    body: payload.body,
    replyToCommentId: payload.replyToCommentId
  });

  broadcastAppEvent(broadcastChannel, {
    kind: "comment.created",
    comment: {
      id: comment.id,
      targetType: comment.targetType,
      targetId: comment.targetId,
      authorName: comment.authorName,
      authorUsername: comment.authorUsername,
      body: comment.body,
      replyToCommentId: comment.replyToCommentId,
      createdAt: comment.createdAt
    }
  });

  await deleteCache(`comments:${payload.targetType}:${payload.targetId}`);

  return comment;
}

export async function listComments(targetType: "status" | "storyChapter" | "anonymousMessage", targetId: string) {
  const cacheKey = `comments:${targetType}:${targetId}`;
  const cachedComments = await readJsonCache<Array<Record<string, unknown>>>(cacheKey);
  if (cachedComments) {
    return cachedComments;
  }

  const comments = await CommentModel.find({ targetType, targetId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("targetType targetId authorName authorUsername body replyToCommentId createdAt");

  await writeJsonCache(cacheKey, comments, 30);
  return comments;
}
