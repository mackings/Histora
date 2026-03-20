import mongoose, { Schema } from "mongoose";

export interface StoryInteractionDocument extends mongoose.Document {
  storyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  kind: "like" | "bookmark";
  createdAt: Date;
  updatedAt: Date;
}

const storyInteractionSchema = new Schema<StoryInteractionDocument>(
  {
    storyId: { type: Schema.Types.ObjectId, ref: "Story", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["like", "bookmark"], required: true }
  },
  { timestamps: true }
);

storyInteractionSchema.index({ storyId: 1, userId: 1, kind: 1 }, { unique: true });

export const StoryInteractionModel = mongoose.model<StoryInteractionDocument>(
  "StoryInteraction",
  storyInteractionSchema
);
