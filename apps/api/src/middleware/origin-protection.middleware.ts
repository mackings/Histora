import type { NextFunction, Request, Response } from "express";

import { isTrustedBrowserOrigin, normalizeOriginValue } from "../config/cors.js";
import { AppError } from "../utils/app-error.js";

function getRequestOrigin(request: Request) {
  const originHeader = request.header("origin");
  if (originHeader) {
    return normalizeOriginValue(originHeader);
  }

  const refererHeader = request.header("referer");
  if (refererHeader) {
    return normalizeOriginValue(refererHeader);
  }

  return null;
}

export function requireTrustedBrowserOrigin(request: Request, _response: Response, next: NextFunction) {
  const origin = getRequestOrigin(request);

  if (!origin || !isTrustedBrowserOrigin(origin)) {
    next(new AppError("Untrusted request origin", 403));
    return;
  }

  next();
}
