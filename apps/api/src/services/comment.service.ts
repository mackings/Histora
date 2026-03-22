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
import { sendGenericNotificationPush } from "./push.service.js";

const getAnonymousInboxChannel = (recipientUserId: string) => `anonymous:inbox:${recipientUserId}`;

export async function createComment(userId: string, payload: CommentCreateInput) {
  const user = await UserModel.findById(userId).select("fullName username");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  let broadcastChannel = "feed";
  let notificationTargetUserId: string | null = null;
  let notificationTitle = "";
  let notificationBody = "";
  let notificationTag = "";
  let notificationUrl = "/feed";

  if (payload.targetType === "status") {
    const status = await StatusModel.findById(payload.targetId);

    if (!status) {
      throw new AppError("Status not found", 404);
    }

    status.commentsCount += 1;
    await status.save();
    await deleteCache("statuses:feed");
    await enqueueCounterSync("status", status.id);

    if (String(status.authorId) !== userId) {
      notificationTargetUserId = String(status.authorId);
      notificationTitle = "New status comment";
      notificationBody = `${user.fullName} (@${user.username}) commented on your ${status.anonymous ? "anonymous status" : "status"}.`;
      notificationTag = `histora-status-comment-${status.id}-${user.username}`;
      notificationUrl = "/feed";
    }
  } else if (payload.targetType === "storyChapter") {
    const [storyId, chapterId] = payload.targetId.split(":");
    const story = await StoryModel.findById(storyId).select("chapters slug authorId title anonymous");

    // The frontend uses storyId:chapterId, so validate the pair before accepting comments.
    if (!story || !chapterId || !story.chapters.some((chapter) => chapter.order.toString() === chapterId || chapter.title === chapterId)) {
      throw new AppError("Story chapter not found", 404);
    }
    await enqueueCounterSync("story", story.id);
    await deleteCache("stories:feed");
    await deleteCache(`stories:public:${story.slug}`);
    await deleteCacheByPrefix(`stories:mine:${story.authorId?.toString?.() ?? ""}`);

    if (String(story.authorId) !== userId) {
      notificationTargetUserId = String(story.authorId);
      notificationTitle = "New post comment";
      notificationBody = `${user.fullName} (@${user.username}) commented on your ${story.anonymous ? "anonymous post" : "post"} "${story.title}".`;
      notificationTag = `histora-story-comment-${story.id}-${user.username}`;
      notificationUrl = `/feed/story/${story.slug}`;
    }
  } else {
    const message = await AnonymousMessageModel.findById(payload.targetId).select("recipientUserId senderUserId shareSlug");

    if (!message) {
      throw new AppError("Anonymous message not found", 404);
    }

    message.commentsCount += 1;
    await message.save();
    await enqueueCounterSync("anonymousMessage", message.id);
    broadcastChannel = getAnonymousInboxChannel(message.recipientUserId.toString());

    if (message.senderUserId && String(message.senderUserId) !== userId) {
      notificationTargetUserId = String(message.senderUserId);
      notificationTitle = "New anonymous post comment";
      notificationBody = `${user.fullName} (@${user.username}) commented on your anonymous post.`;
      notificationTag = `histora-anonymous-comment-${message.id}-${user.username}`;
      notificationUrl = `/anonymous/${message.shareSlug}`;
    }
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

  if (notificationTargetUserId) {
    broadcastAppEvent(`user:${notificationTargetUserId}`, {
      kind: "notification.generic",
      title: notificationTitle,
      body: notificationBody
    });
    void sendGenericNotificationPush(notificationTargetUserId, {
      title: notificationTitle,
      body: notificationBody,
      tag: notificationTag,
      url: notificationUrl
    }).catch(() => undefined);
  }

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
