import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalString = () =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, z.string().min(1).optional());

const optionalUrl = () =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, z.string().url().optional());

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_COOKIE_NAME: z.string().min(1).default("histora_refresh"),
  APP_BASE_URL: optionalUrl(),
  SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().email().optional()),
  SMTP_PASSWORD: optionalString(),
  SMTP_FROM_NAME: z.string().min(1).default("Histora"),
  VAPID_PUBLIC_KEY: optionalString(),
  VAPID_PRIVATE_KEY: optionalString(),
  VAPID_SUBJECT: z.string().min(1).default("mailto:security@histora.app"),
  OPENAI_API_KEY: optionalString(),
  ASSEMBLYAI_API_KEY: optionalString(),
  TRANSCRIPTION_PROVIDER: z.enum(["openai", "assemblyai"]).default("openai"),
  REDIS_URL: optionalUrl(),
  R2_ACCOUNT_ID: optionalString(),
  R2_ACCESS_KEY_ID: optionalString(),
  R2_SECRET_ACCESS_KEY: optionalString(),
  R2_BUCKET_NAME: optionalString(),
  R2_PUBLIC_BASE_URL: optionalUrl(),
  CLAMAV_HOST: optionalString(),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  TURNSTILE_SECRET_KEY: optionalString(),
  DATA_ENCRYPTION_KEY: optionalString(),
  CLIENT_ORIGIN: optionalUrl(),
  CLIENT_ORIGINS: optionalString(),
  ALLOW_VERCEL_PREVIEWS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production") {
    if (!value.JWT_REFRESH_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message: "JWT_REFRESH_SECRET is required in production."
      });
    }

    if (value.JWT_REFRESH_SECRET && value.JWT_REFRESH_SECRET === value.JWT_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message: "JWT_REFRESH_SECRET must differ from JWT_SECRET in production."
      });
    }

    if (!value.DATA_ENCRYPTION_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATA_ENCRYPTION_KEY"],
        message: "DATA_ENCRYPTION_KEY is required in production."
      });
    }

    if (!value.CLIENT_ORIGIN && !value.CLIENT_ORIGINS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLIENT_ORIGIN"],
        message: "At least one trusted client origin is required in production."
      });
    }
  }

  const r2Values = [
    value.R2_ACCOUNT_ID,
    value.R2_ACCESS_KEY_ID,
    value.R2_SECRET_ACCESS_KEY,
    value.R2_BUCKET_NAME
  ];
  const someR2Configured = r2Values.some(Boolean);
  const allR2Configured = r2Values.every(Boolean);
  if (someR2Configured && !allR2Configured) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["R2_ACCOUNT_ID"],
      message: "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME must be configured together."
    });
  }

  const someVapidConfigured = Boolean(value.VAPID_PUBLIC_KEY || value.VAPID_PRIVATE_KEY);
  if (someVapidConfigured && !(value.VAPID_PUBLIC_KEY && value.VAPID_PRIVATE_KEY)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["VAPID_PUBLIC_KEY"],
      message: "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be configured."
    });
  }

  if (!value.CLAMAV_HOST && "CLAMAV_PORT" in value && process.env.CLAMAV_PORT) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CLAMAV_HOST"],
      message: "CLAMAV_HOST must be configured when CLAMAV_PORT is set."
    });
  }
});

export const env = envSchema.parse(process.env);
