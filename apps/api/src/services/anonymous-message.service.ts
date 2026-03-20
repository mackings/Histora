import type { AnonymousMessageCreateInput } from "../shared/index.js";

import {
  AnonymousMessageModel,
  type AnonymousMessageDocument
} from "../models/anonymous-message.model.js";
import { CommentModel } from "../models/comment.model.js";
import { UserModel } from "../models/user.model.js";
import { broadcastAppEvent } from "../realtime/app-events.js";
import { recordAuditEvent } from "./audit.service.js";
import { decryptSensitiveValue, encryptSensitiveValue } from "./encryption.service.js";
import { AppError } from "../utils/app-error.js";

const buildShareSlug = () => `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const getAnonymousInboxChannel = (recipientUserId: string) => `anonymous:inbox:${recipientUserId}`;
type AnonymousMessageResponseRecord = Pick<
  AnonymousMessageDocument,
  | "recipientUsername"
  | "body"
  | "shareSlug"
  | "distribution"
  | "commentsCount"
  | "helpFee"
  | "helperContactNameEncrypted"
  | "helperContactPhoneEncrypted"
  | "createdAt"
> & {
  id?: string;
  _id?: unknown;
};

const toAnonymousResponse = (
  message: AnonymousMessageResponseRecord,
  options?: { includeHelperContact?: boolean }
) => ({
  id: message.id ?? String(message._id ?? ""),
  recipientUsername: message.recipientUsername,
  body: message.body,
  shareSlug: message.shareSlug,
  distribution: message.distribution,
  commentsCount: message.commentsCount,
  helpFee: message.helpFee,
  helperContact:
    options?.includeHelperContact &&
    message.helperContactNameEncrypted && message.helperContactPhoneEncrypted
      ? {
          name: decryptSensitiveValue(message.helperContactNameEncrypted),
          phone: decryptSensitiveValue(message.helperContactPhoneEncrypted)
        }
      : null,
  createdAt: message.createdAt
});

export async function createAnonymousMessage(
  payload: AnonymousMessageCreateInput,
  actorUserId?: string
) {
  const recipient = await UserModel.findOne({ username: payload.recipientUsername.toLowerCase() }).select("username");

  if (!recipient) {
    throw new AppError("Recipient not found", 404);
  }

  const message = await AnonymousMessageModel.create({
    senderUserId: actorUserId ?? null,
    recipientUserId: recipient.id,
    recipientUsername: recipient.username,
    body: payload.body,
    shareSlug: buildShareSlug(),
    distribution: payload.distribution,
    helpFee: 8
  });

  broadcastAppEvent(getAnonymousInboxChannel(recipient.id), {
    kind: "anonymous.inbox.received",
    message: {
      id: message.id,
      shareSlug: message.shareSlug,
      body: message.body,
      distribution: message.distribution,
      commentsCount: message.commentsCount,
      createdAt: message.createdAt
    }
  });

  if (message.distribution === "app") {
    broadcastAppEvent("anonymous:public", {
      kind: "anonymous.public.created",
      message: {
        id: message.id,
        shareSlug: message.shareSlug,
        body: message.body,
        commentsCount: message.commentsCount,
        createdAt: message.createdAt
      }
    });
  }

  await recordAuditEvent({
    actorUserId: actorUserId ?? null,
    targetUserId: recipient.id,
    entityType: "anonymousMessage",
    entityId: message.id,
    action: "anonymous-message.created",
    metadata: {
      shareSlug: message.shareSlug,
      distribution: message.distribution
    }
  });

  return toAnonymousResponse(message);
}

export async function listAnonymousInbox(userId: string) {
  const messages = await AnonymousMessageModel.find({ recipientUserId: userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select(
      "recipientUsername body shareSlug distribution commentsCount helpFee helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
    );

  return messages.map((message) => toAnonymousResponse(message));
}

export async function listSentAnonymousMessages(userId: string) {
  const messages = await AnonymousMessageModel.find({ senderUserId: userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select(
      "recipientUsername body shareSlug distribution commentsCount helpFee helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
    );

  return messages.map((message) => toAnonymousResponse(message));
}

export async function getAnonymousMessageBySlug(shareSlug: string) {
  const message = await AnonymousMessageModel.findOne({ shareSlug }).select(
    "recipientUsername body shareSlug distribution commentsCount helpFee helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
  );

  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  return toAnonymousResponse(message);
}

export async function updateAnonymousDistribution(userId: string, messageId: string, distribution: "app" | "external") {
  const message = await AnonymousMessageModel.findOne({ _id: messageId, recipientUserId: userId });

  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  message.distribution = distribution;
  await message.save();

  await recordAuditEvent({
    actorUserId: userId,
    targetUserId: message.recipientUserId.toString(),
    entityType: "anonymousMessage",
    entityId: message.id,
    action: "anonymous-message.distribution.updated",
    metadata: {
      distribution
    }
  });

  return toAnonymousResponse(message, { includeHelperContact: true });
}

export async function getAnonymousMessageForRecipient(userId: string, shareSlug: string) {
  const message = await AnonymousMessageModel.findOne({
    shareSlug,
    recipientUserId: userId
  }).select(
    "recipientUsername body shareSlug distribution commentsCount helpFee helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
  );

  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  return toAnonymousResponse(message, { includeHelperContact: true });
}

export async function unlockAnonymousHelperContact(input: {
  actorUserId: string;
  messageId: string;
  helper: { name: string; phone: string };
}) {
  const message = await AnonymousMessageModel.findById(input.messageId);
  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  message.helperContactNameEncrypted = encryptSensitiveValue(input.helper.name);
  message.helperContactPhoneEncrypted = encryptSensitiveValue(input.helper.phone);
  await message.save();

  await recordAuditEvent({
    actorUserId: input.actorUserId,
    targetUserId: message.recipientUserId.toString(),
    entityType: "anonymousMessage",
    entityId: message.id,
    action: "helper-contact.unlocked",
    metadata: {
      shareSlug: message.shareSlug
    }
  });

  return toAnonymousResponse(message, { includeHelperContact: true });
}

export async function deleteAnonymousMessage(userId: string, messageId: string) {
  const message = await AnonymousMessageModel.findOne({
    _id: messageId,
    senderUserId: userId
  });

  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  await Promise.all([
    CommentModel.deleteMany({ targetType: "anonymousMessage", targetId: message.id }),
    message.deleteOne()
  ]);

  await recordAuditEvent({
    actorUserId: userId,
    targetUserId: message.recipientUserId.toString(),
    entityType: "anonymousMessage",
    entityId: message.id,
    action: "anonymous-message.deleted",
    metadata: {
      shareSlug: message.shareSlug
    }
  });

  return { ok: true as const };
}
