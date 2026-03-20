import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import * as rateLimitModule from "express-rate-limit";
import * as helmetModule from "helmet";

import { createCorsOptions } from "./config/cors.js";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { anonymousMessageRouter } from "./routes/anonymous-message.routes.js";
import { commentRouter } from "./routes/comment.routes.js";
import { mediaRouter } from "./routes/media.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { statusRouter } from "./routes/status.routes.js";
import { storyRouter } from "./routes/story.routes.js";
import { transcriptionRouter } from "./routes/transcription.routes.js";
import { getRateLimitStore } from "./services/rate-limit.service.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";

export function createApp() {
  const helmet = ("default" in helmetModule
    ? helmetModule.default
    : helmetModule) as unknown as typeof import("helmet").default;
  const rateLimit = ("default" in rateLimitModule
    ? rateLimitModule.default
    : (rateLimitModule as unknown as { rateLimit: typeof import("express-rate-limit").default }).rateLimit) as typeof import("express-rate-limit").default;
  const app = express();
  const truncateLogValue = (value: string) => (value.length > 1200 ? `${value.slice(0, 1200)}...` : value);
  const formatLogPayload = (value: unknown) => {
    if (typeof value === "undefined") {
      return "";
    }

    if (typeof value === "string") {
      return truncateLogValue(value);
    }

    try {
      return truncateLogValue(JSON.stringify(value));
    } catch {
      return "[unserializable]";
    }
  };
  const apiResponseLogger: express.RequestHandler = (request, response, next) => {
    if (!request.path.startsWith("/api/")) {
      next();
      return;
    }

    const requestPayload = formatLogPayload(request.body);
    let responsePayload: unknown;
    const originalJson = response.json.bind(response);
    const originalSend = response.send.bind(response);

    response.json = ((body: unknown) => {
      responsePayload = body;
      return originalJson(body);
    }) as typeof response.json;

    response.send = ((body?: unknown) => {
      if (typeof responsePayload === "undefined") {
        responsePayload = body;
      }
      return originalSend(body);
    }) as typeof response.send;

    response.on("finish", () => {
      const payloadText = formatLogPayload(responsePayload);
      const parts = [`[API] ${request.method} ${request.originalUrl} ${response.statusCode}`];
      if (requestPayload) {
        parts.push(`request=${requestPayload}`);
      }
      if (payloadText) {
        parts.push(`response=${payloadText}`);
      }
      console.log(parts.join(" "));
    });

    next();
  };

  app.set("trust proxy", 1);
  app.set("etag", false);
  app.disable("x-powered-by");

  app.use(cors(createCorsOptions()));
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 200,
      store: getRateLimitStore("histora:rate-limit:global:"),
      standardHeaders: true,
      legacyHeaders: false,
      skip: (request) => request.path.startsWith("/api/transcriptions")
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(apiResponseLogger);

  app.get("/", (_request, response) => {
    response.status(200).json({ ok: true, service: "Histora API" });
  });
  app.head("/", (_request, response) => {
    response.status(204).end();
  });

  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/statuses", statusRouter);
  app.use("/api/comments", commentRouter);
  app.use("/api/anonymous-messages", anonymousMessageRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/stories", storyRouter);
  app.use("/api/transcriptions", transcriptionRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
