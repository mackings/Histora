import type { NextFunction, Request, Response } from "express";

import { AppError } from "../utils/app-error.js";
import { authenticateAccessToken } from "../services/session-auth.service.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
      sessionId: string;
    };
  }
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    next(new AppError("Authentication required", 401));
    return;
  }

  try {
    request.auth = await authenticateAccessToken(token);
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
}

export async function optionalAuth(request: Request, _response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    next();
    return;
  }

  try {
    request.auth = await authenticateAccessToken(token);
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
}
