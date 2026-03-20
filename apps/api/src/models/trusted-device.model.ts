import crypto from "crypto";
import mongoose, { Schema } from "mongoose";

export interface TrustedDeviceDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  deviceKeyHash: string;
  label: string;
  userAgent?: string;
  lastIpAddress?: string;
  approvedAt: Date;
  lastSeenAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const trustedDeviceSchema = new Schema<TrustedDeviceDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceKeyHash: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true },
    userAgent: { type: String },
    lastIpAddress: { type: String },
    approvedAt: { type: Date, required: true, default: () => new Date() },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    revokedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

trustedDeviceSchema.index({ userId: 1, deviceKeyHash: 1 }, { unique: true });

export const TrustedDeviceModel = mongoose.model<TrustedDeviceDocument>("TrustedDevice", trustedDeviceSchema);

export const hashDeviceKey = (deviceKey: string) => crypto.createHash("sha256").update(deviceKey).digest("hex");
