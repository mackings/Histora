import mongoose, { Schema } from "mongoose";

const momentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    happenedAt: { type: Date, required: true },
    imageUrls: [{ type: String }],
    voiceNoteUrl: { type: String }
  },
  { _id: false }
);

const chapterSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    type: { type: String, enum: ["memory", "reflection", "milestone", "anonymous"], default: "memory" },
    order: { type: Number, required: true },
    imageUrls: [{ type: String }],
    voiceNoteUrl: { type: String },
    moments: [momentSchema]
  },
  { _id: false }
);

const storySchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
    coverImageUrl: { type: String },
    visibility: { type: String, enum: ["private", "public", "selected"], default: "private", index: true },
    anonymous: { type: Boolean, default: false, index: true },
    allowedViewerIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    tags: [{ type: String }],
    chapters: [chapterSchema],
    readCount: { type: Number, default: 0 },
    reactionsCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const StoryModel = mongoose.model("Story", storySchema);
