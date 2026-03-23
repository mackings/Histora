import mongoose, { Schema } from "mongoose";

export interface ContributorInviteDocument extends mongoose.Document {
  ownerUserId: mongoose.Types.ObjectId;
  ownerName: string;
  ownerUsername: string;
  email: string;
  recipientUserId?: mongoose.Types.ObjectId | null;
  circle: "family" | "friend";
  storyId: mongoose.Types.ObjectId;
  storyTitle: string;
  storySlug: string;
  status: "pending" | "accepted" | "revoked";
  acceptedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const contributorInviteSchema = new Schema<ContributorInviteDocument>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ownerName: { type: String, required: true, trim: true },
    ownerUsername: { type: String, required: true, trim: true, lowercase: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    circle: { type: String, enum: ["family", "friend"], required: true },
    storyId: { type: Schema.Types.ObjectId, ref: "Story", required: true, index: true },
    storyTitle: { type: String, required: true, trim: true },
    storySlug: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ["pending", "accepted", "revoked"], default: "pending", index: true },
    acceptedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const ContributorInviteModel = mongoose.model<ContributorInviteDocument>(
  "ContributorInvite",
  contributorInviteSchema
);
