import crypto from "crypto";

import type { AnonymousMessageCreateInput } from "../shared/index.js";

import {
  AnonymousMessageModel,
  type AnonymousMessageDocument
} from "../models/anonymous-message.model.js";
import { CommentModel } from "../models/comment.model.js";
import { UserModel } from "../models/user.model.js";
import { broadcastAppEvent } from "../realtime/app-events.js";
import { recordAuditEvent } from "./audit.service.js";
import {
  buildEncryptedTextFields,
  decryptSensitiveValue,
  encryptSensitiveValue,
  resolveDecryptedText
} from "./encryption.service.js";
import { AppError } from "../utils/app-error.js";

const buildShareSlug = () => `anon-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("base64url")}`;
const buildHelpRequestId = () => `help-${Date.now().toString(36)}-${crypto.randomBytes(5).toString("base64url")}`;
const getAnonymousInboxChannel = (recipientUserId: string) => `anonymous:inbox:${recipientUserId}`;
type AnonymousMessageResponseRecord = Pick<
  AnonymousMessageDocument,
  | "recipientUsername"
  | "body"
  | "bodyEncrypted"
  | "shareSlug"
  | "distribution"
  | "commentsCount"
  | "helpFee"
  | "helpRequests"
  | "helperContactNameEncrypted"
  | "helperContactPhoneEncrypted"
  | "createdAt"
> & {
  id?: string;
  _id?: unknown;
};

const toAnonymousResponse = (
  message: AnonymousMessageResponseRecord,
  options?: { includeHelperContact?: boolean; viewerRole?: "recipient" | "reader" | "sender" | null; includeHelpRequests?: boolean }
) => ({
  id: message.id ?? String(message._id ?? ""),
  recipientUsername: message.recipientUsername,
  body: resolveDecryptedText(message.body, message.bodyEncrypted),
  shareSlug: message.shareSlug,
  distribution: message.distribution,
  commentsCount: message.commentsCount,
  helpFee: message.helpFee,
  viewerRole: options?.viewerRole ?? null,
  canRequestHelp: options?.viewerRole === "reader",
  helpRequests:
    options?.includeHelpRequests
      ? (message.helpRequests ?? []).map((request) => ({
          id: request.id,
          createdAt: request.createdAt,
          accepted: Boolean(request.acceptedAt),
          helperName: request.acceptedAt ? request.requesterName : null,
          helperUsername: request.acceptedAt ? request.requesterUsername : null
        }))
      : [],
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
    ...buildEncryptedTextFields(payload.body),
    shareSlug: buildShareSlug(),
    distribution: payload.distribution,
    helpFee: 8
  });

  broadcastAppEvent(getAnonymousInboxChannel(recipient.id), {
    kind: "anonymous.inbox.received",
      message: {
        id: message.id,
        shareSlug: message.shareSlug,
        body: payload.body,
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
        body: payload.body,
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
      "recipientUsername body bodyEncrypted shareSlug distribution commentsCount helpFee helpRequests helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
    );

  return messages.map((message) =>
    toAnonymousResponse(message, {
      includeHelperContact: true,
      includeHelpRequests: true,
      viewerRole: "recipient"
    })
  );
}

export async function listSentAnonymousMessages(userId: string) {
  const messages = await AnonymousMessageModel.find({ senderUserId: userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select(
      "recipientUsername body bodyEncrypted shareSlug distribution commentsCount helpFee helpRequests helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
    );

  return messages.map((message) => toAnonymousResponse(message, { viewerRole: "sender" }));
}

export async function getAnonymousMessageBySlug(shareSlug: string, viewerUserId?: string) {
  const message = await AnonymousMessageModel.findOne({ shareSlug }).select(
    "senderUserId recipientUserId recipientUsername body bodyEncrypted shareSlug distribution commentsCount helpFee helpRequests helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
  );

  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  const viewerRole =
    viewerUserId && String(message.recipientUserId) === viewerUserId
      ? "recipient"
      : viewerUserId && String(message.senderUserId ?? "") === viewerUserId
        ? "sender"
        : "reader";

  return toAnonymousResponse(message, {
    viewerRole,
    includeHelperContact: viewerRole === "recipient",
    includeHelpRequests: viewerRole === "recipient"
  });
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
    "recipientUsername body bodyEncrypted shareSlug distribution commentsCount helpFee helpRequests helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
  );

  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  return toAnonymousResponse(message, {
    includeHelperContact: true,
    includeHelpRequests: true,
    viewerRole: "recipient"
  });
}

export async function requestAnonymousHelp(input: {
  actorUserId: string;
  shareSlug: string;
}) {
  const [actor, message] = await Promise.all([
    UserModel.findById(input.actorUserId).select("fullName username"),
    AnonymousMessageModel.findOne({ shareSlug: input.shareSlug }).select(
      "recipientUserId senderUserId recipientUsername body bodyEncrypted shareSlug distribution commentsCount helpFee helpRequests helperContactNameEncrypted helperContactPhoneEncrypted createdAt"
    )
  ]);

  if (!actor || !message) {
    throw new AppError("Anonymous message not found", 404);
  }

  if (String(message.recipientUserId) === input.actorUserId) {
    throw new AppError("You cannot request to help your own anonymous message.", 400);
  }

  const existingPending = (message.helpRequests ?? []).find(
    (request) => String(request.requesterUserId) === input.actorUserId && !request.acceptedAt
  );
  if (existingPending) {
    return toAnonymousResponse(message, { viewerRole: "reader" });
  }

  const requesterUserId = actor._id as typeof message.helpRequests[number]["requesterUserId"];
  message.helpRequests = [
    ...(message.helpRequests ?? []),
    {
      id: buildHelpRequestId(),
      requesterUserId,
      requesterName: actor.fullName,
      requesterUsername: actor.username,
      createdAt: new Date(),
      acceptedAt: null
    }
  ];
  await message.save();

  broadcastAppEvent(getAnonymousInboxChannel(String(message.recipientUserId)), {
    kind: "anonymous.inbox.received",
    message: {
      id: message.id,
      shareSlug: message.shareSlug,
      body: resolveDecryptedText(message.body, message.bodyEncrypted),
      distribution: message.distribution,
      commentsCount: message.commentsCount,
      createdAt: message.createdAt
    }
  });

  await recordAuditEvent({
    actorUserId: input.actorUserId,
    targetUserId: String(message.recipientUserId),
    entityType: "anonymousMessage",
    entityId: message.id,
    action: "anonymous-message.help-requested",
    metadata: {
      shareSlug: message.shareSlug
    }
  });

  return toAnonymousResponse(message, { viewerRole: "reader" });
}

export async function acceptAnonymousHelpRequest(input: {
  actorUserId: string;
  messageId: string;
  requestId: string;
}) {
  const message = await AnonymousMessageModel.findOne({
    _id: input.messageId,
    recipientUserId: input.actorUserId
  });
  if (!message) {
    throw new AppError("Anonymous message not found", 404);
  }

  const targetRequest = (message.helpRequests ?? []).find((request) => request.id === input.requestId);
  if (!targetRequest) {
    throw new AppError("Help request not found", 404);
  }

  targetRequest.acceptedAt = targetRequest.acceptedAt ?? new Date();
  message.helperContactNameEncrypted = encryptSensitiveValue(targetRequest.requesterName);
  message.helperContactPhoneEncrypted = encryptSensitiveValue(`@${targetRequest.requesterUsername}`);
  await message.save();

  await recordAuditEvent({
    actorUserId: input.actorUserId,
    targetUserId: String(targetRequest.requesterUserId),
    entityType: "anonymousMessage",
    entityId: message.id,
    action: "anonymous-message.help-request.accepted",
    metadata: {
      shareSlug: message.shareSlug,
      requestId: input.requestId
    }
  });

  return toAnonymousResponse(message, {
    includeHelperContact: true,
    includeHelpRequests: true,
    viewerRole: "recipient"
  });
}

export async function unlockAnonymousHelperContact(input: {
  actorUserId: string;
  messageId: string;
  helper: { name: string; phone: string };
}) {
  const message = await AnonymousMessageModel.findOne({
    _id: input.messageId,
    recipientUserId: input.actorUserId
  });
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
