import crypto from "crypto";

import type { StatusCreateInput } from "../shared/index.js";

import { StatusModel } from "../models/status.model.js";
import { StatusInteractionModel } from "../models/status-interaction.model.js";
import { UserModel } from "../models/user.model.js";
import { CommentModel } from "../models/comment.model.js";
import { FollowModel } from "../models/follow.model.js";
import { deleteCache, readJsonCache, writeJsonCache } from "./cache.service.js";
import { buildEncryptedTextFields, resolveDecryptedText } from "./encryption.service.js";
import { enqueueCounterSync } from "./queue.service.js";
import { AppError } from "../utils/app-error.js";
import { broadcastAppEvent } from "../realtime/app-events.js";
import { sendStatusReactionNotificationPush } from "./push.service.js";

const buildStatusShareSlug = () => `status-${Date.now().toString(36)}-${crypto.randomBytes(5).toString("base64url")}`;
const statusLifetimeMs = 24 * 60 * 60 * 1000;

const toStatusResponse = (status: {
  id?: string;
  _id?: unknown;
  authorName: string;
  authorUsername: string;
  body: string;
  bodyEncrypted?: string | null;
  anonymous: boolean;
  visibility: "public" | "followers" | "private";
  authorVerified?: boolean;
  imageUrl?: string | null;
  shareSlug?: string | null;
  commentsCount: number;
  likesCount: number;
  bookmarksCount: number;
  createdAt: Date;
  expiresAt?: Date;
}) => ({
  id: status.id ?? String(status._id ?? ""),
  authorName: status.authorName,
  authorUsername: status.authorUsername,
  body: resolveDecryptedText(status.body, status.bodyEncrypted),
  anonymous: status.anonymous,
  visibility: status.visibility,
  authorVerified: status.authorVerified ?? false,
  imageUrl: status.imageUrl ?? null,
  shareSlug: status.shareSlug ?? null,
  commentsCount: Number(status.commentsCount ?? 0),
  likesCount: Number(status.likesCount ?? 0),
  bookmarksCount: Number(status.bookmarksCount ?? 0),
  createdAt: status.createdAt,
  ...(status.expiresAt ? { expiresAt: status.expiresAt } : {})
});

export async function assertStatusViewerAccess(statusId: string, viewerId?: string, shareSlug?: string) {
  const status = await StatusModel.findById(statusId).select("authorId visibility anonymous shareSlug");

  if (!status) {
    throw new AppError("Status not found", 404);
  }

  if (viewerId && String(status.authorId) === viewerId) {
    return status;
  }

  if (status.visibility === "public") {
    return status;
  }

  if (status.anonymous && shareSlug && status.shareSlug === shareSlug) {
    return status;
  }

  if (status.visibility === "followers" && viewerId) {
    const follow = await FollowModel.findOne({
      followerUserId: viewerId,
      followeeUserId: status.authorId
    })
      .select("_id")
      .lean();

    if (follow) {
      return status;
    }
  }

  throw new AppError("Status not found", 404);
}

export async function createStatus(userId: string, payload: StatusCreateInput) {
  const user = await UserModel.findById(userId).select("fullName username verificationStatus");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const status = await StatusModel.create({
    authorId: userId,
    authorName: payload.anonymous ? "Anonymous" : user.fullName,
    authorUsername: payload.anonymous ? "anonymous" : user.username,
    ...buildEncryptedTextFields(payload.body),
    anonymous: payload.anonymous,
    visibility: payload.visibility,
    imageUrl: payload.imageUrl,
    shareSlug: payload.anonymous ? buildStatusShareSlug() : undefined,
    expiresAt: new Date(Date.now() + statusLifetimeMs)
  });

  await deleteCache("statuses:feed");
  await recordStatusAuditEvent(userId, status.id, "status.created", {
    anonymous: status.anonymous,
    visibility: status.visibility
  });

  // Broadcast a tiny event envelope so feeds can update without reloading.
  broadcastAppEvent("feed", {
    kind: "status.created",
    status: toStatusResponse({
      ...status.toObject(),
      authorVerified: user.verificationStatus === "verified"
    })
  });
  broadcastAppEvent(`user:${userId}`, {
    kind: "status.created",
    status: toStatusResponse({
      ...status.toObject(),
      authorVerified: user.verificationStatus === "verified"
    })
  });

  return toStatusResponse({
    ...status.toObject(),
    authorVerified: user.verificationStatus === "verified"
  });
}

export async function getStatusFeed(viewerId?: string) {
  if (viewerId) {
    const followedUserIds = (
      await FollowModel.find({ followerUserId: viewerId }).select("followeeUserId").lean()
    ).map((follow) => follow.followeeUserId);

    const feed = await StatusModel.find({
      $and: [
        {
          $or: [
            { visibility: "public" },
            { authorId: viewerId },
            { visibility: "followers", authorId: { $in: followedUserIds } }
          ]
        },
        {
          $or: [
            { expiresAt: { $gt: new Date() } },
            { createdAt: { $gt: new Date(Date.now() - statusLifetimeMs) } }
          ]
        }
      ],
    })
      .sort({ createdAt: -1 })
      .limit(40)
      .select("authorName authorUsername body bodyEncrypted anonymous visibility imageUrl commentsCount likesCount bookmarksCount shareSlug createdAt expiresAt");

    const visibleUsernames = [...new Set(feed.filter((status) => !status.anonymous).map((status) => status.authorUsername))];
    const verifiedUsernames = new Set(
      (
        await UserModel.find({
          username: { $in: visibleUsernames },
          verificationStatus: "verified"
        })
          .select("username")
          .lean()
      ).map((user) => user.username)
    );

    return feed.map((status) =>
      toStatusResponse({
        ...status.toObject(),
        authorVerified: !status.anonymous && verifiedUsernames.has(status.authorUsername)
      })
    );
  }

  const cachedFeed = await readJsonCache<Array<Record<string, unknown>>>("statuses:feed");
  if (cachedFeed) {
    return cachedFeed;
  }

  // Keep the feed query intentionally small so status loading stays cheap and cache-friendly.
  const feed = await StatusModel.find({
    visibility: "public",
    $or: [
      { expiresAt: { $gt: new Date() } },
      { createdAt: { $gt: new Date(Date.now() - statusLifetimeMs) } }
    ]
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .select("authorName authorUsername body bodyEncrypted anonymous visibility imageUrl commentsCount likesCount bookmarksCount shareSlug createdAt expiresAt");

  const visibleUsernames = [...new Set(feed.filter((status) => !status.anonymous).map((status) => status.authorUsername))];
  const verifiedUsernames = new Set(
    (
      await UserModel.find({
        username: { $in: visibleUsernames },
        verificationStatus: "verified"
      })
        .select("username")
        .lean()
    ).map((user) => user.username)
  );

  const response = feed.map((status) =>
    toStatusResponse({
      ...status.toObject(),
      authorVerified: !status.anonymous && verifiedUsernames.has(status.authorUsername)
    })
  );
  await writeJsonCache("statuses:feed", response, 30);
  return response;
}

export async function getMyStatuses(userId: string) {
  const user = await UserModel.findById(userId).select("verificationStatus").lean();
  const statuses = await StatusModel.find({
    authorId: userId,
    $or: [
      { expiresAt: { $gt: new Date() } },
      { createdAt: { $gt: new Date(Date.now() - statusLifetimeMs) } }
    ]
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("authorName authorUsername body bodyEncrypted anonymous visibility imageUrl commentsCount likesCount bookmarksCount shareSlug createdAt expiresAt");

  return statuses.map((status) =>
    toStatusResponse({
      ...status.toObject(),
      authorVerified: user?.verificationStatus === "verified"
    })
  );
}

export async function getAnonymousStatusByShareSlug(shareSlug: string) {
  const status = await StatusModel.findOne({
    shareSlug,
    anonymous: true,
    $or: [
      { expiresAt: { $gt: new Date() } },
      { createdAt: { $gt: new Date(Date.now() - statusLifetimeMs) } }
    ]
  }).select("authorName authorUsername body bodyEncrypted anonymous visibility imageUrl commentsCount likesCount bookmarksCount shareSlug createdAt expiresAt");

  if (!status) {
    throw new AppError("Anonymous status not found", 404);
  }

  return toStatusResponse(status);
}

export async function toggleStatusReaction(statusId: string, userId: string, action: "like" | "bookmark") {
  const status = await assertStatusViewerAccess(statusId, userId);

  const existingInteraction = await StatusInteractionModel.findOne({
    statusId,
    userId,
    kind: action
  });

  let active = false;

  if (existingInteraction) {
    await existingInteraction.deleteOne();
    active = false;
  } else {
    await StatusInteractionModel.create({
      statusId,
      userId,
      kind: action
    });
    active = true;
  }

  if (action === "like") {
    status.likesCount = Math.max(0, Number(status.likesCount ?? 0) + (active ? 1 : -1));
  } else {
    status.bookmarksCount = Math.max(0, Number(status.bookmarksCount ?? 0) + (active ? 1 : -1));
  }

  await status.save();
  await deleteCache("statuses:feed");
  await enqueueCounterSync("status", status.id);
  await recordStatusAuditEvent(userId, status.id, `status.${action}.${active ? "enabled" : "disabled"}`);

  const reactor = await UserModel.findById(userId).select("fullName username").lean();

  broadcastAppEvent("feed", {
    kind: "status.reaction.updated",
    statusId: status.id,
    action,
    active,
    likesCount: status.likesCount,
    bookmarksCount: status.bookmarksCount
  });

  if (active && reactor && String(status.authorId) !== userId) {
    broadcastAppEvent(`user:${String(status.authorId)}`, {
      kind: "notification.status.reacted",
      username: reactor.username,
      fullName: reactor.fullName
    });
    void sendStatusReactionNotificationPush(String(status.authorId), {
      reactorName: reactor.fullName,
      reactorUsername: reactor.username
    }).catch(() => undefined);
  }

  return {
    statusId: status.id,
    action,
    active,
    likesCount: status.likesCount,
    bookmarksCount: status.bookmarksCount
  };
}

export async function deleteStatus(statusId: string, userId: string) {
  const status = await StatusModel.findOne({ _id: statusId, authorId: userId });

  if (!status) {
    throw new AppError("Status not found", 404);
  }

  await Promise.all([
    StatusInteractionModel.deleteMany({ statusId: status.id }),
    CommentModel.deleteMany({ targetType: "status", targetId: status.id }),
    status.deleteOne()
  ]);

  await deleteCache("statuses:feed");
  await recordStatusAuditEvent(userId, status.id, "status.deleted", {
    anonymous: status.anonymous,
    visibility: status.visibility
  });

  broadcastAppEvent("feed", {
    kind: "status.deleted",
    statusId: status.id
  });
  broadcastAppEvent(`user:${userId}`, {
    kind: "status.deleted",
    statusId: status.id
  });

  return { ok: true as const };
}

async function recordStatusAuditEvent(
  actorUserId: string,
  entityId: string,
  action: string,
  metadata?: Record<string, unknown>
) {
  const { recordAuditEvent } = await import("./audit.service.js");
  await recordAuditEvent({
    actorUserId,
    targetUserId: actorUserId,
    entityType: "status",
    entityId,
    action,
    metadata
  });
}
