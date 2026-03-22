import mongoose, { Schema } from "mongoose";

export interface StatusDocument extends mongoose.Document {
  authorId: mongoose.Types.ObjectId;
  authorName: string;
  authorUsername: string;
  body: string;
  bodyEncrypted?: string | null;
  anonymous: boolean;
  visibility: "public" | "followers" | "private";
  imageUrl?: string;
  shareSlug?: string;
  expiresAt: Date;
  commentsCount: number;
  likesCount: number;
  bookmarksCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const statusSchema = new Schema<StatusDocument>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorName: { type: String, required: true, trim: true },
    authorUsername: { type: String, required: true, trim: true, lowercase: true },
    body: { type: String, required: true, trim: true },
    bodyEncrypted: { type: String, default: null },
    anonymous: { type: Boolean, default: false, index: true },
    visibility: { type: String, enum: ["public", "followers", "private"], default: "public", index: true },
    imageUrl: { type: String },
    shareSlug: { type: String, index: true, sparse: true },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: true
    },
    commentsCount: { type: Number, default: 0 },
    likesCount: { type: Number, default: 0 },
    bookmarksCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const StatusModel = mongoose.model<StatusDocument>("Status", statusSchema);
