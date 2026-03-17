import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ASSEMBLYAI_API_KEY: z.string().min(1).optional(),
  TRANSCRIPTION_PROVIDER: z.enum(["openai", "assemblyai"]).default("openai"),
  CLIENT_ORIGIN: z.string().url().optional(),
  CLIENT_ORIGINS: z.string().optional(),
  ALLOW_VERCEL_PREVIEWS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export const env = envSchema.parse(process.env);
