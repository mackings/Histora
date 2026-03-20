import crypto from "crypto";
import mongoose, { Schema } from "mongoose";

export interface SessionDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  family: string;
  parentSessionId?: mongoose.Types.ObjectId | null;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<SessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    family: { type: String, required: true, index: true, default: () => crypto.randomUUID() },
    parentSessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null, index: true },
    userAgent: { type: String },
    ipAddress: { type: String },
    expiresAt: { type: Date, required: true, index: true },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    revokedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

export const SessionModel = mongoose.model<SessionDocument>("Session", sessionSchema);
