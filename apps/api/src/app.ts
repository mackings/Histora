import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import * as rateLimitModule from "express-rate-limit";
import * as helmetModule from "helmet";
import morgan from "morgan";

import { createCorsOptions } from "./config/cors.js";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { storyRouter } from "./routes/story.routes.js";
import { transcriptionRouter } from "./routes/transcription.routes.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";

export function createApp() {
  const helmet = ("default" in helmetModule
    ? helmetModule.default
    : helmetModule) as unknown as typeof import("helmet").default;
  const rateLimit = ("default" in rateLimitModule
    ? rateLimitModule.default
    : (rateLimitModule as unknown as { rateLimit: typeof import("express-rate-limit").default }).rateLimit) as typeof import("express-rate-limit").default;
  const app = express();

  app.set("trust proxy", 1);

  app.use(cors(createCorsOptions()));
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 200,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (request) => request.path.startsWith("/api/transcriptions")
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/stories", storyRouter);
  app.use("/api/transcriptions", transcriptionRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
