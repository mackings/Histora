import mongoose, { Schema } from "mongoose";

export interface FollowDocument extends mongoose.Document {
  followerUserId: mongoose.Types.ObjectId;
  followeeUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const followSchema = new Schema<FollowDocument>(
  {
    followerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    followeeUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }
  },
  { timestamps: true }
);

followSchema.index({ followerUserId: 1, followeeUserId: 1 }, { unique: true });

export const FollowModel = mongoose.model<FollowDocument>("Follow", followSchema);
