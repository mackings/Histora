import mongoose, { Schema } from "mongoose";

export interface AnonymousMessageDocument extends mongoose.Document {
  senderUserId?: mongoose.Types.ObjectId | null;
  recipientUserId: mongoose.Types.ObjectId;
  recipientUsername: string;
  body: string;
  bodyEncrypted?: string | null;
  shareSlug: string;
  distribution: "app" | "external";
  commentsCount: number;
  helpFee: number;
  helperContactNameEncrypted?: string | null;
  helperContactPhoneEncrypted?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const anonymousMessageSchema = new Schema<AnonymousMessageDocument>(
  {
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientUsername: { type: String, required: true, trim: true, lowercase: true, index: true },
    body: { type: String, required: true, trim: true },
    bodyEncrypted: { type: String, default: null },
    shareSlug: { type: String, required: true, unique: true, index: true },
    distribution: { type: String, enum: ["app", "external"], default: "external", index: true },
    commentsCount: { type: Number, default: 0 },
    helpFee: { type: Number, default: 8 },
    helperContactNameEncrypted: { type: String, default: null },
    helperContactPhoneEncrypted: { type: String, default: null }
  },
  { timestamps: true }
);

export const AnonymousMessageModel = mongoose.model<AnonymousMessageDocument>(
  "AnonymousMessage",
  anonymousMessageSchema
);
