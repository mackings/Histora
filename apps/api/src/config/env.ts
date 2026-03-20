import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_COOKIE_NAME: z.string().min(1).default("histora_refresh"),
  APP_BASE_URL: z.string().url().optional(),
  SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM_NAME: z.string().min(1).default("Histora"),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).default("mailto:security@histora.app"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ASSEMBLYAI_API_KEY: z.string().min(1).optional(),
  TRANSCRIPTION_PROVIDER: z.enum(["openai", "assemblyai"]).default("openai"),
  REDIS_URL: z.string().url().optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  DATA_ENCRYPTION_KEY: z.string().min(32).optional(),
  CLIENT_ORIGIN: z.string().url().optional(),
  CLIENT_ORIGINS: z.string().optional(),
  ALLOW_VERCEL_PREVIEWS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export const env = envSchema.parse(process.env);
