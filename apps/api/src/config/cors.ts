import type { CorsOptions } from "cors";

import { env } from "./env.js";

const localOrigins = env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://127.0.0.1:3000"];

function normalizeConfiguredOrigins() {
  const configuredOrigins = [
    env.CLIENT_ORIGIN,
    ...(env.CLIENT_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [])
  ].filter(Boolean) as string[];

  return [...localOrigins, ...configuredOrigins];
}

function getVercelPreviewPrefixes(allowedOrigins: Iterable<string>) {
  const prefixes = new Set<string>();

  for (const origin of allowedOrigins) {
    try {
      const { hostname } = new URL(origin);
      if (!hostname.endsWith(".vercel.app")) {
        continue;
      }

      const [projectName] = hostname.split(".");
      if (projectName) {
        prefixes.add(`${projectName}-`);
      }
    } catch {
      continue;
    }
  }

  return prefixes;
}

export function getAllowedOrigins() {
  return new Set(normalizeConfiguredOrigins());
}

export function normalizeOriginValue(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isTrustedBrowserOrigin(origin: string, allowedOrigins = getAllowedOrigins()) {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  if (env.ALLOW_VERCEL_PREVIEWS) {
    try {
      const { hostname, protocol } = new URL(origin);
      if (protocol !== "https:" || !hostname.endsWith(".vercel.app")) {
        return false;
      }

      const allowedPreviewPrefixes = getVercelPreviewPrefixes(allowedOrigins);
      return [...allowedPreviewPrefixes].some((prefix) => hostname.startsWith(prefix));
    } catch {
      return false;
    }
  }

  return false;
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      if (!origin || isTrustedBrowserOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  };
}
