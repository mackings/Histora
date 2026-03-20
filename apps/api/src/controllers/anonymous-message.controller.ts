import { z } from "zod";

import {
  anonymousDistributionUpdateSchema,
  anonymousHelpUnlockSchema,
  anonymousMessageCreateSchema
} from "../shared/index.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  createAnonymousMessage,
  deleteAnonymousMessage,
  getAnonymousMessageForRecipient,
  getAnonymousMessageBySlug,
  listAnonymousInbox,
  listSentAnonymousMessages,
  unlockAnonymousHelperContact,
  updateAnonymousDistribution
} from "../services/anonymous-message.service.js";

export const createAnonymousMessageController = asyncHandler(async (request, response) => {
  const message = await createAnonymousMessage(
    anonymousMessageCreateSchema.parse(request.body),
    request.auth?.userId
  );
  response.status(201).json(message);
});

export const listAnonymousInboxController = asyncHandler(async (request, response) => {
  const messages = await listAnonymousInbox(request.auth!.userId);
  response.status(200).json(messages);
});

export const listSentAnonymousMessagesController = asyncHandler(async (request, response) => {
  const messages = await listSentAnonymousMessages(request.auth!.userId);
  response.status(200).json(messages);
});

export const getAnonymousMessageController = asyncHandler(async (request, response) => {
  const params = z.object({ shareSlug: z.string().min(1) }).parse(request.params);
  const message = await getAnonymousMessageBySlug(params.shareSlug);
  response.status(200).json(message);
});

export const getAnonymousRecipientMessageController = asyncHandler(async (request, response) => {
  const params = z.object({ shareSlug: z.string().min(1) }).parse(request.params);
  const message = await getAnonymousMessageForRecipient(request.auth!.userId, params.shareSlug);
  response.status(200).json(message);
});

export const updateAnonymousDistributionController = asyncHandler(async (request, response) => {
  const params = z.object({ messageId: z.string().min(1) }).parse(request.params);
  const body = anonymousDistributionUpdateSchema.parse(request.body);
  const message = await updateAnonymousDistribution(request.auth!.userId, params.messageId, body.distribution);
  response.status(200).json(message);
});

export const unlockAnonymousHelperContactController = asyncHandler(async (request, response) => {
  const params = z.object({ messageId: z.string().min(1) }).parse(request.params);
  const body = anonymousHelpUnlockSchema.parse(request.body);
  const message = await unlockAnonymousHelperContact({
    actorUserId: request.auth!.userId,
    messageId: params.messageId,
    helper: {
      name: body.helperName,
      phone: body.helperPhone
    }
  });
  response.status(200).json(message);
});

export const deleteAnonymousMessageController = asyncHandler(async (request, response) => {
  const params = z.object({ messageId: z.string().min(1) }).parse(request.params);
  const result = await deleteAnonymousMessage(request.auth!.userId, params.messageId);
  response.status(200).json(result);
});
