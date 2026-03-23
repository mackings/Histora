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
  helpRequests: Array<{
    id: string;
    requesterUserId: mongoose.Types.ObjectId;
    requesterName: string;
    requesterUsername: string;
    createdAt: Date;
    acceptedAt?: Date | null;
  }>;
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
    helpRequests: [
      new Schema(
        {
          id: { type: String, required: true },
          requesterUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
          requesterName: { type: String, required: true, trim: true },
          requesterUsername: { type: String, required: true, trim: true, lowercase: true },
          createdAt: { type: Date, required: true, default: () => new Date() },
          acceptedAt: { type: Date, default: null }
        },
        { _id: false }
      )
    ],
    helperContactNameEncrypted: { type: String, default: null },
    helperContactPhoneEncrypted: { type: String, default: null }
  },
  { timestamps: true }
);

export const AnonymousMessageModel = mongoose.model<AnonymousMessageDocument>(
  "AnonymousMessage",
  anonymousMessageSchema
);
