import path from "path";
import { z } from "zod";
import type { Request } from "express";

import { signedUploadSchema } from "../shared/index.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditEvent } from "../services/audit.service.js";
import {
  assertOwnedObjectKey,
  createSignedReadUrl,
  createSignedUploadUrl,
  uploadObjectDirect
} from "../services/storage.service.js";

const sanitizeFileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-");

const extensionByContentType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/webm": ".webm",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "video/mp4": ".mp4",
  "video/webm": ".webm"
};

const directUploadQuerySchema = z.object({
  fileName: z.string().min(1).max(240),
  contentType: signedUploadSchema.shape.contentType
});

const getRawRequestBody = (request: Request) => {
  if (request.body instanceof Buffer) {
    return new Uint8Array(request.body);
  }

  if (request.body instanceof Uint8Array) {
    return request.body;
  }

  throw new Error("Missing upload payload.");
};

export const createSignedUploadController = asyncHandler(async (request, response) => {
  const payload = signedUploadSchema.parse(request.body);
  const extension = extensionByContentType[payload.contentType] ?? (path.extname(payload.fileName) || ".bin");
  const baseName = sanitizeFileName(path.basename(payload.fileName, extension)) || "upload";
  const objectKey = `users/${request.auth!.userId}/${Date.now()}-${baseName}${extension}`;
  const result = await createSignedUploadUrl({
    objectKey,
    contentType: payload.contentType
  });

  await recordAuditEvent({
    actorUserId: request.auth!.userId,
    entityType: "mediaUpload",
    entityId: objectKey,
    action: "signed-upload.created",
    metadata: {
      contentType: payload.contentType
    }
  });

  response.status(200).json(result);
});

export const createSignedReadController = asyncHandler(async (request, response) => {
  const query = z.object({ objectKey: z.string().min(1).max(500) }).parse(request.query);
  assertOwnedObjectKey(request.auth!.userId, query.objectKey);
  const result = await createSignedReadUrl({
    objectKey: query.objectKey
  });

  await recordAuditEvent({
    actorUserId: request.auth!.userId,
    entityType: "mediaUpload",
    entityId: query.objectKey,
    action: "signed-read.created"
  });

  response.status(200).json(result);
});

export const uploadMediaDirectController = asyncHandler(async (request, response) => {
  const payload = directUploadQuerySchema.parse(request.query);
  const extension = extensionByContentType[payload.contentType] ?? (path.extname(payload.fileName) || ".bin");
  const baseName = sanitizeFileName(path.basename(payload.fileName, extension)) || "upload";
  const objectKey = `users/${request.auth!.userId}/${Date.now()}-${baseName}${extension}`;
  const binaryBody = getRawRequestBody(request);

  const result = await uploadObjectDirect({
    objectKey,
    contentType: payload.contentType,
    body: binaryBody
  });

  await recordAuditEvent({
    actorUserId: request.auth!.userId,
    entityType: "mediaUpload",
    entityId: objectKey,
    action: "direct-upload.created",
    metadata: {
      contentType: payload.contentType,
      size: binaryBody.byteLength
    }
  });

  if (result.publicUrl) {
    response.status(200).json({
      objectKey: result.objectKey,
      readUrl: result.publicUrl
    });
    return;
  }

  const signedRead = await createSignedReadUrl({
    objectKey: result.objectKey
  });

  response.status(200).json({
    objectKey: result.objectKey,
    readUrl: signedRead.readUrl
  });
});
