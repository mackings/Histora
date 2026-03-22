import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { SessionModel } from "../models/session.model.js";

type AccessTokenPayload = {
  sub: string;
  sid?: string;
  typ?: string;
};

export async function authenticateAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

  if (payload.typ !== "access" || !payload.sub || !payload.sid) {
    throw new Error("Invalid access token payload");
  }

  const session = await SessionModel.findOne({
    _id: payload.sid,
    userId: payload.sub,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  })
    .select("_id")
    .lean();

  if (!session) {
    throw new Error("Inactive session");
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid
  };
}
