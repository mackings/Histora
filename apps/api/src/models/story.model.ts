import mongoose, { Schema } from "mongoose";

export interface StoryDocument extends mongoose.Document {
  authorId: mongoose.Types.ObjectId;
  authorName: string;
  authorUsername: string;
  slug: string;
  status: "draft" | "published";
  title: string;
  summary: string;
  coverImageUrl?: string;
  visibility: "private" | "public" | "selected";
  anonymous: boolean;
  allowedViewerIds: mongoose.Types.ObjectId[];
  tags: string[];
  links: Array<{
    label: string;
    url: string;
    kind: "website" | "social" | "drive" | "photos";
  }>;
  chapters: Array<{
    title: string;
    body: string;
    type: "memory" | "reflection" | "milestone" | "anonymous";
    order: number;
    imageUrls: string[];
    voiceNoteUrl?: string;
    moments: Array<{
      title: string;
      description: string;
      happenedAt: Date;
      imageUrls: string[];
      voiceNoteUrl?: string;
    }>;
  }>;
  readCount: number;
  reactionsCount: number;
  likesCount: number;
  bookmarksCount: number;
  sharesCount: number;
  commentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

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

const storyLinkSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["website", "social", "drive", "photos"], default: "website" }
  },
  { _id: false }
);

const storySchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorName: { type: String, required: true, trim: true },
    authorUsername: { type: String, required: true, trim: true, lowercase: true },
    slug: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    title: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
    coverImageUrl: { type: String },
    visibility: { type: String, enum: ["private", "public", "selected"], default: "private", index: true },
    anonymous: { type: Boolean, default: false, index: true },
    allowedViewerIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    tags: [{ type: String }],
    links: [storyLinkSchema],
    chapters: [chapterSchema],
    readCount: { type: Number, default: 0 },
    reactionsCount: { type: Number, default: 0 },
    likesCount: { type: Number, default: 0 },
    bookmarksCount: { type: Number, default: 0 },
    sharesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const StoryModel = mongoose.model<StoryDocument>("Story", storySchema);
