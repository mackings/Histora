import mongoose, { Schema } from "mongoose";

export interface ContributorInviteDocument extends mongoose.Document {
  ownerUserId: mongoose.Types.ObjectId;
  email: string;
  circle: "family" | "friend";
  storyId: mongoose.Types.ObjectId;
  storyTitle: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: Date;
  updatedAt: Date;
}

const contributorInviteSchema = new Schema<ContributorInviteDocument>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    circle: { type: String, enum: ["family", "friend"], required: true },
    storyId: { type: Schema.Types.ObjectId, ref: "Story", required: true, index: true },
    storyTitle: { type: String, required: true, trim: true },
    status: { type: String, enum: ["pending", "accepted", "revoked"], default: "pending", index: true }
  },
  { timestamps: true }
);

export const ContributorInviteModel = mongoose.model<ContributorInviteDocument>(
  "ContributorInvite",
  contributorInviteSchema
);
