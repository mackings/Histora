import type { CommentCreateInput } from "../shared/index.js";

import { AnonymousMessageModel } from "../models/anonymous-message.model.js";
import { CommentModel } from "../models/comment.model.js";
import { UserModel } from "../models/user.model.js";
import { deleteCache, deleteCacheByPrefix } from "./cache.service.js";
import { broadcastAppEvent } from "../realtime/app-events.js";
import { buildEncryptedTextFields, resolveDecryptedText } from "./encryption.service.js";
import { enqueueCounterSync } from "./queue.service.js";
import { AppError } from "../utils/app-error.js";
import { sendGenericNotificationPush } from "./push.service.js";
import { assertStatusViewerAccess } from "./status.service.js";
import { assertStoryViewerAccess } from "./story.service.js";
import { StoryModel } from "../models/story.model.js";
import { resolveStoryTextContent } from "./story-content.service.js";

const getAnonymousInboxChannel = (recipientUserId: string) => `anonymous:inbox:${recipientUserId}`;

const toCommentResponse = (comment: {
  id?: string;
  _id?: unknown;
  targetType: "status" | "storyChapter" | "anonymousMessage";
  targetId: string;
  authorName: string;
  authorUsername: string;
  body: string;
  bodyEncrypted?: string | null;
  replyToCommentId?: string;
  createdAt: Date;
}) => ({
  id: comment.id ?? String(comment._id ?? ""),
  targetType: comment.targetType,
  targetId: comment.targetId,
  authorName: comment.authorName,
  authorUsername: comment.authorUsername,
  body: resolveDecryptedText(comment.body, comment.bodyEncrypted),
  replyToCommentId: comment.replyToCommentId,
  createdAt: comment.createdAt
});

const toAnonymousCommentResponse = (comment: {
  id?: string;
  _id?: unknown;
  targetType: "status" | "storyChapter" | "anonymousMessage";
  targetId: string;
  body: string;
  bodyEncrypted?: string | null;
  replyToCommentId?: string;
  createdAt: Date;
}) => ({
  id: comment.id ?? String(comment._id ?? ""),
  targetType: comment.targetType,
  targetId: comment.targetId,
  authorName: "Anonymous",
  authorUsername: "anonymous",
  body: resolveDecryptedText(comment.body, comment.bodyEncrypted),
  replyToCommentId: comment.replyToCommentId,
  createdAt: comment.createdAt
});

async function assertStatusCommentAccess(statusId: string, viewerId?: string, shareSlug?: string) {
  return assertStatusViewerAccess(statusId, viewerId, shareSlug);
}

async function assertStoryChapterCommentAccess(targetId: string, viewerId?: string) {
  const [storyId, chapterId] = targetId.split(":");
  const story = await StoryModel.findById(storyId).select(
    "chapters slug authorId title anonymous visibility allowedViewerIds status contentEncrypted"
  );

  if (!story || !chapterId || !story.chapters.some((chapter) => chapter.order.toString() === chapterId)) {
    throw new AppError("Story chapter not found", 404);
  }

  await assertStoryViewerAccess(storyId, viewerId);

  return story;
}

async function assertAnonymousMessageCommentAccess(messageId: string, viewerId?: string, shareSlug?: string) {
  const message = await AnonymousMessageModel.findById(messageId).select("recipientUserId senderUserId shareSlug");

  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  if (viewerId && (String(message.recipientUserId) === viewerId || String(message.senderUserId ?? "") === viewerId)) {
    return message;
  }

  if (shareSlug && shareSlug === message.shareSlug) {
    return message;
  }

  throw new AppError("Anonymous message not found", 404);
}

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

  let anonymousResponse = false;
  if (payload.targetType === "status") {
    const status = await assertStatusCommentAccess(payload.targetId, userId, payload.shareSlug);
    anonymousResponse = Boolean(status.anonymous && payload.shareSlug);

    status.commentsCount = Math.max(0, Number(status.commentsCount ?? 0) + 1);
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
    const story = await assertStoryChapterCommentAccess(payload.targetId, userId);
    await enqueueCounterSync("story", story.id);
    await deleteCache("stories:feed");
    await deleteCache(`stories:public:${story.slug}`);
    await deleteCacheByPrefix(`stories:mine:${story.authorId?.toString?.() ?? ""}`);

    if (String(story.authorId) !== userId) {
      notificationTargetUserId = String(story.authorId);
      notificationTitle = "New post comment";
      notificationBody = `${user.fullName} (@${user.username}) commented on your ${story.anonymous ? "anonymous post" : "post"} "${resolveStoryTextContent(story).title}".`;
      notificationTag = `histora-story-comment-${story.id}-${user.username}`;
      notificationUrl = `/feed/story/${story.slug}`;
    }
  } else {
    const message = await assertAnonymousMessageCommentAccess(payload.targetId, userId, payload.shareSlug);
    anonymousResponse = true;

    message.commentsCount = Math.max(0, Number(message.commentsCount ?? 0) + 1);
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
    ...buildEncryptedTextFields(payload.body),
    replyToCommentId: payload.replyToCommentId
  });

  broadcastAppEvent(broadcastChannel, {
    kind: "comment.created",
    comment: (anonymousResponse ? toAnonymousCommentResponse : toCommentResponse)({
      ...comment.toObject(),
      body: payload.body
    })
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
  return (anonymousResponse ? toAnonymousCommentResponse : toCommentResponse)(comment);
}

export async function listComments(
  targetType: "status" | "storyChapter" | "anonymousMessage",
  targetId: string,
  viewerId?: string,
  shareSlug?: string
) {
  let anonymousResponse = false;
  if (targetType === "status") {
    const status = await assertStatusCommentAccess(targetId, viewerId, shareSlug);
    anonymousResponse = Boolean(status.anonymous && shareSlug);
  } else if (targetType === "storyChapter") {
    await assertStoryChapterCommentAccess(targetId, viewerId);
  } else {
    await assertAnonymousMessageCommentAccess(targetId, viewerId, shareSlug);
    anonymousResponse = true;
  }

  const comments = await CommentModel.find({ targetType, targetId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("targetType targetId authorName authorUsername body bodyEncrypted replyToCommentId createdAt");

  return comments.map((comment) => (anonymousResponse ? toAnonymousCommentResponse : toCommentResponse)(comment));
}
