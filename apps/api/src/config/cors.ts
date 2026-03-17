import type { CorsOptions } from "cors";

import { env } from "./env.js";

const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

function normalizeOrigins() {
  const configuredOrigins = [
    env.CLIENT_ORIGIN,
    ...(env.CLIENT_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [])
  ].filter(Boolean) as string[];

  return new Set([...localOrigins, ...configuredOrigins]);
}

function isAllowedOrigin(origin: string, allowedOrigins: Set<string>) {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  if (env.ALLOW_VERCEL_PREVIEWS) {
    try {
      const { hostname, protocol } = new URL(origin);
      return protocol === "https:" && hostname.endsWith(".vercel.app");
    } catch {
      return false;
    }
  }

  return false;
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = normalizeOrigins();

  return {
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  };
}
