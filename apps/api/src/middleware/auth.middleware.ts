import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
    };
  }
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    next(new AppError("Authentication required", 401));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; typ?: string };
    if (payload.typ !== "access" || !payload.sub) {
      throw new Error("Invalid token type");
    }

    request.auth = { userId: payload.sub };
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
}
