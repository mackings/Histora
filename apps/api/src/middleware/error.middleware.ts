import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "../utils/app-error.js";
import { env } from "../config/env.js";

export function notFoundMiddleware(_request: Request, _response: Response, next: NextFunction) {
  next(new AppError("Route not found", 404));
}

export function errorMiddleware(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    response.status(400).json({
      message: "Validation failed",
      issues: error.flatten()
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }

  response.status(500).json({
    message: "Internal server error",
    ...(env.NODE_ENV !== "production" && error instanceof Error ? { detail: error.message } : {})
  });
}
