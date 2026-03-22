import crypto from "crypto";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

export const ENCRYPTED_CONTENT_PLACEHOLDER = "[encrypted]";

const deriveKey = () => {
  if (!env.DATA_ENCRYPTION_KEY) {
    return null;
  }

  return crypto.createHash("sha256").update(env.DATA_ENCRYPTION_KEY).digest();
};

const encryptionKey = deriveKey();

export function encryptSensitiveValue(value: string) {
  if (!value.trim()) {
    throw new AppError("Cannot encrypt an empty value.", 400);
  }

  if (!encryptionKey) {
    throw new AppError("Sensitive data encryption is not configured on the server.", 500);
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSensitiveValue(payload?: string | null) {
  if (!payload) {
    return null;
  }

  if (!encryptionKey) {
    throw new AppError("Sensitive data encryption is not configured on the server.", 500);
  }

  const [ivPart, tagPart, valuePart] = payload.split(".");
  if (!ivPart || !tagPart || !valuePart) {
    throw new AppError("Encrypted payload is malformed.", 500);
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(ivPart, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(valuePart, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

export function buildEncryptedTextFields(value: string) {
  return {
    body: ENCRYPTED_CONTENT_PLACEHOLDER,
    bodyEncrypted: encryptSensitiveValue(value)
  };
}

export function resolveDecryptedText(body: string, bodyEncrypted?: string | null) {
  return decryptSensitiveValue(bodyEncrypted) ?? body;
}
