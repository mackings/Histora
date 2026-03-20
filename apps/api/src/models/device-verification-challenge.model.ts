import mongoose, { Schema } from "mongoose";

export interface DeviceVerificationChallengeDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  deviceKeyHash: string;
  deviceLabel: string;
  userAgent?: string;
  ipAddress?: string;
  otpHash: string;
  expiresAt: Date;
  failedAttempts: number;
  lastAttemptAt?: Date | null;
  consumedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const deviceVerificationChallengeSchema = new Schema<DeviceVerificationChallengeDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    deviceKeyHash: { type: String, required: true, index: true },
    deviceLabel: { type: String, required: true, trim: true },
    userAgent: { type: String },
    ipAddress: { type: String },
    otpHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    failedAttempts: { type: Number, required: true, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const DeviceVerificationChallengeModel = mongoose.model<DeviceVerificationChallengeDocument>(
  "DeviceVerificationChallenge",
  deviceVerificationChallengeSchema
);
