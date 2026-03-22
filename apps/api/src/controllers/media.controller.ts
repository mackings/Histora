import path from "path";
import { z } from "zod";
import type { Request } from "express";

import { signedUploadSchema } from "../shared/index.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { AppError } from "../utils/app-error.js";
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

const maxBytesByContentType: Record<string, number> = {
  "image/jpeg": 12 * 1024 * 1024,
  "image/png": 12 * 1024 * 1024,
  "image/webp": 12 * 1024 * 1024,
  "image/gif": 12 * 1024 * 1024,
  "audio/webm": 24 * 1024 * 1024,
  "audio/mp4": 24 * 1024 * 1024,
  "audio/mpeg": 24 * 1024 * 1024,
  "audio/wav": 24 * 1024 * 1024,
  "audio/ogg": 24 * 1024 * 1024,
  "video/mp4": 32 * 1024 * 1024,
  "video/webm": 32 * 1024 * 1024
};

const startsWithBytes = (body: Uint8Array, signature: number[]) =>
  body.length >= signature.length && signature.every((byte, index) => body[index] === byte);

const includesAsciiAt = (body: Uint8Array, offset: number, value: string) =>
  body.length >= offset + value.length &&
  value.split("").every((char, index) => body[offset + index] === char.charCodeAt(0));

const matchesDeclaredMediaType = (body: Uint8Array, contentType: string) => {
  switch (contentType) {
    case "image/jpeg":
      return startsWithBytes(body, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWithBytes(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return includesAsciiAt(body, 0, "GIF87a") || includesAsciiAt(body, 0, "GIF89a");
    case "image/webp":
      return includesAsciiAt(body, 0, "RIFF") && includesAsciiAt(body, 8, "WEBP");
    case "audio/wav":
      return includesAsciiAt(body, 0, "RIFF") && includesAsciiAt(body, 8, "WAVE");
    case "audio/ogg":
      return includesAsciiAt(body, 0, "OggS");
    case "audio/mpeg":
      return includesAsciiAt(body, 0, "ID3") || (body.length >= 2 && body[0] === 0xff && (body[1] & 0xe0) === 0xe0);
    case "audio/webm":
    case "video/webm":
      return startsWithBytes(body, [0x1a, 0x45, 0xdf, 0xa3]);
    case "audio/mp4":
    case "video/mp4":
      return body.length >= 12 && includesAsciiAt(body, 4, "ftyp");
    default:
      return false;
  }
};

const assertUploadPayloadMatchesContentType = (body: Uint8Array, contentType: string, headerContentType?: string) => {
  const normalizedHeader = headerContentType?.split(";")[0]?.trim().toLowerCase();
  if (normalizedHeader && normalizedHeader !== contentType) {
    throw new AppError("Upload content-type header does not match the declared file type.", 400);
  }

  if (!body.byteLength) {
    throw new AppError("Upload payload is empty.", 400);
  }

  const maxBytes = maxBytesByContentType[contentType];
  if (maxBytes && body.byteLength > maxBytes) {
    throw new AppError("Upload exceeds the allowed size for this media type.", 413);
  }

  if (!matchesDeclaredMediaType(body, contentType)) {
    throw new AppError("Upload payload does not match the declared file type.", 400);
  }
};

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
  assertUploadPayloadMatchesContentType(binaryBody, payload.contentType, request.header("content-type") ?? undefined);

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
