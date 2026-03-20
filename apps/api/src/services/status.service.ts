import type { StatusCreateInput } from "../shared/index.js";

import { StatusModel } from "../models/status.model.js";
import { StatusInteractionModel } from "../models/status-interaction.model.js";
import { UserModel } from "../models/user.model.js";
import { deleteCache, readJsonCache, writeJsonCache } from "./cache.service.js";
import { enqueueCounterSync } from "./queue.service.js";
import { AppError } from "../utils/app-error.js";
import { broadcastAppEvent } from "../realtime/app-events.js";

const buildStatusShareSlug = () => `status-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function createStatus(userId: string, payload: StatusCreateInput) {
  const user = await UserModel.findById(userId).select("fullName username");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const status = await StatusModel.create({
    authorId: userId,
    authorName: payload.anonymous ? "Anonymous" : user.fullName,
    authorUsername: payload.anonymous ? "anonymous" : user.username,
    body: payload.body,
    anonymous: payload.anonymous,
    visibility: payload.visibility,
    imageUrl: payload.imageUrl,
    shareSlug: payload.anonymous ? buildStatusShareSlug() : undefined
  });

  await deleteCache("statuses:feed");
  await recordStatusAuditEvent(userId, status.id, "status.created", {
    anonymous: status.anonymous,
    visibility: status.visibility
  });

  // Broadcast a tiny event envelope so feeds can update without reloading.
  broadcastAppEvent("feed", {
    kind: "status.created",
    status: {
      id: status.id,
      body: status.body,
      anonymous: status.anonymous,
      visibility: status.visibility,
      imageUrl: status.imageUrl,
      likesCount: status.likesCount,
      bookmarksCount: status.bookmarksCount,
      commentsCount: status.commentsCount,
      authorName: status.authorName,
      authorUsername: status.authorUsername,
      createdAt: status.createdAt
    }
  });

  return status;
}

export async function getStatusFeed() {
  const cachedFeed = await readJsonCache<Array<Record<string, unknown>>>("statuses:feed");
  if (cachedFeed) {
    return cachedFeed;
  }

  // Keep the feed query intentionally small so status loading stays cheap and cache-friendly.
  const feed = await StatusModel.find({ visibility: "public" })
    .sort({ createdAt: -1 })
    .limit(30)
    .select("authorName authorUsername body anonymous visibility imageUrl commentsCount likesCount bookmarksCount shareSlug createdAt");

  await writeJsonCache("statuses:feed", feed, 30);
  return feed;
}

export async function toggleStatusReaction(statusId: string, userId: string, action: "like" | "bookmark") {
  const status = await StatusModel.findById(statusId);

  if (!status) {
    throw new AppError("Status not found", 404);
  }

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
    status.likesCount = Math.max(0, status.likesCount + (active ? 1 : -1));
  } else {
    status.bookmarksCount = Math.max(0, status.bookmarksCount + (active ? 1 : -1));
  }

  await status.save();
  await deleteCache("statuses:feed");
  await enqueueCounterSync("status", status.id);
  await recordStatusAuditEvent(userId, status.id, `status.${action}.${active ? "enabled" : "disabled"}`);

  broadcastAppEvent("feed", {
    kind: "status.reaction.updated",
    statusId: status.id,
    action,
    active,
    likesCount: status.likesCount,
    bookmarksCount: status.bookmarksCount
  });

  return {
    statusId: status.id,
    action,
    active,
    likesCount: status.likesCount,
    bookmarksCount: status.bookmarksCount
  };
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
