import { GetObjectCommand, S3Client, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

let storageClient: S3Client | null = null;

const assertStorageConfig = () => {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    throw new AppError("Cloudflare R2 is not configured on the server.", 500);
  }
};

export function getStorageClient() {
  assertStorageConfig();

  if (!storageClient) {
    storageClient = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY as string
      }
    });
  }

  return storageClient;
}

export async function createSignedUploadUrl(input: {
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const client = getStorageClient();
  const commandModule = await import("@aws-sdk/client-s3");
  const command = new commandModule.PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: input.objectKey,
    ContentType: input.contentType
  } satisfies PutObjectCommandInput);

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? 900
  });

  const publicUrl = env.R2_PUBLIC_BASE_URL
    ? `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${input.objectKey}`
    : null;

  return {
    uploadUrl,
    objectKey: input.objectKey,
    publicUrl
  };
}

export function isOwnedStorageObjectKey(value: string) {
  return /^users\/[^/]+\/.+/.test(value);
}

export function assertOwnedObjectKey(userId: string, objectKey: string) {
  if (!objectKey.startsWith(`users/${userId}/`)) {
    throw new AppError("You do not have access to this media object.", 403);
  }
}

export async function createSignedReadUrl(input: {
  objectKey: string;
  expiresInSeconds?: number;
}) {
  const client = getStorageClient();
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: input.objectKey
  });

  const readUrl = await getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? 900
  });

  return {
    objectKey: input.objectKey,
    readUrl
  };
}

export async function resolveStoredObjectUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  if (!isOwnedStorageObjectKey(value)) {
    return value;
  }

  if (env.R2_PUBLIC_BASE_URL) {
    return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${value}`;
  }

  const result = await createSignedReadUrl({ objectKey: value });
  return result.readUrl;
}
