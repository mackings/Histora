import mongoose, { Schema } from "mongoose";

export interface StatusInteractionDocument extends mongoose.Document {
  statusId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  kind: "like" | "bookmark";
  createdAt: Date;
  updatedAt: Date;
}

const statusInteractionSchema = new Schema<StatusInteractionDocument>(
  {
    statusId: { type: Schema.Types.ObjectId, ref: "Status", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["like", "bookmark"], required: true }
  },
  { timestamps: true }
);

statusInteractionSchema.index({ statusId: 1, userId: 1, kind: 1 }, { unique: true });

export const StatusInteractionModel = mongoose.model<StatusInteractionDocument>(
  "StatusInteraction",
  statusInteractionSchema
);
