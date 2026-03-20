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
  TURNSTILE_SECRET_KEY: optionalString(),
  DATA_ENCRYPTION_KEY: optionalString(),
  CLIENT_ORIGIN: optionalUrl(),
  CLIENT_ORIGINS: optionalString(),
  ALLOW_VERCEL_PREVIEWS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export const env = envSchema.parse(process.env);
