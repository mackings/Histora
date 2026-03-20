import mongoose, { Schema } from "mongoose";

export interface PushSubscriptionDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  deviceKeyHash: string;
  endpoint: string;
  expirationTime?: number | null;
  p256dh: string;
  auth: string;
  userAgent?: string;
  lastSeenAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<PushSubscriptionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceKeyHash: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true, index: true },
    expirationTime: { type: Number, default: null },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    userAgent: { type: String },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    revokedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ userId: 1, deviceKeyHash: 1, revokedAt: 1 });

export const PushSubscriptionModel = mongoose.model<PushSubscriptionDocument>(
  "PushSubscription",
  pushSubscriptionSchema
);
