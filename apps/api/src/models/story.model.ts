import mongoose, { Schema } from "mongoose";

export interface StoryDocument extends mongoose.Document {
  authorId: mongoose.Types.ObjectId;
  authorName: string;
  authorUsername: string;
  slug: string;
  status: "draft" | "published";
  title: string;
  summary: string;
  contentEncrypted?: string | null;
  coverImageUrl?: string;
  visibility: "private" | "public" | "selected";
  anonymous: boolean;
  allowedViewerIds: mongoose.Types.ObjectId[];
  collaborators: Array<{
    userId: mongoose.Types.ObjectId;
    fullName: string;
    username: string;
    invitedByUserId: mongoose.Types.ObjectId;
    joinedAt: Date;
  }>;
  collaborationRevision: number;
  lastEditedByUserId?: mongoose.Types.ObjectId | null;
  lastEditedByName?: string | null;
  lastEditedByUsername?: string | null;
  lastEditedAt?: Date | null;
  tags: string[];
  links: Array<{
    label: string;
    url: string;
    kind: "website" | "social" | "drive" | "photos";
  }>;
  chapters: Array<{
    id: string;
    title: string;
    body: string;
    type: "memory" | "reflection" | "milestone" | "anonymous";
    order: number;
    createdByUserId?: mongoose.Types.ObjectId | null;
    createdByName?: string | null;
    createdByUsername?: string | null;
    createdAt?: Date | null;
    lastEditedByUserId?: mongoose.Types.ObjectId | null;
    lastEditedByName?: string | null;
    lastEditedByUsername?: string | null;
    lastEditedAt?: Date | null;
    imageUrls: string[];
    voiceNoteUrl?: string;
    moments: Array<{
      id: string;
      title: string;
      description: string;
      happenedAt: Date;
      createdByUserId?: mongoose.Types.ObjectId | null;
      createdByName?: string | null;
      createdByUsername?: string | null;
      createdAt?: Date | null;
      lastEditedByUserId?: mongoose.Types.ObjectId | null;
      lastEditedByName?: string | null;
      lastEditedByUsername?: string | null;
      lastEditedAt?: Date | null;
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
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    happenedAt: { type: Date, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: null },
    createdByUsername: { type: String, default: null },
    createdAt: { type: Date, default: null },
    lastEditedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastEditedByName: { type: String, default: null },
    lastEditedByUsername: { type: String, default: null },
    lastEditedAt: { type: Date, default: null },
    imageUrls: [{ type: String }],
    voiceNoteUrl: { type: String }
  },
  { _id: false }
);

const chapterSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    type: { type: String, enum: ["memory", "reflection", "milestone", "anonymous"], default: "memory" },
    order: { type: Number, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: null },
    createdByUsername: { type: String, default: null },
    createdAt: { type: Date, default: null },
    lastEditedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastEditedByName: { type: String, default: null },
    lastEditedByUsername: { type: String, default: null },
    lastEditedAt: { type: Date, default: null },
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
    contentEncrypted: { type: String, default: null },
    coverImageUrl: { type: String },
    visibility: { type: String, enum: ["private", "public", "selected"], default: "private", index: true },
    anonymous: { type: Boolean, default: false, index: true },
    allowedViewerIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    collaborators: [
      new Schema(
        {
          userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
          fullName: { type: String, required: true, trim: true },
          username: { type: String, required: true, trim: true, lowercase: true },
          invitedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
          joinedAt: { type: Date, required: true, default: () => new Date() }
        },
        { _id: false }
      )
    ],
    collaborationRevision: { type: Number, default: 0 },
    lastEditedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastEditedByName: { type: String, default: null },
    lastEditedByUsername: { type: String, default: null },
    lastEditedAt: { type: Date, default: null },
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
