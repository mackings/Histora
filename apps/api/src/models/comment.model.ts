import mongoose, { Schema } from "mongoose";

export interface CommentDocument extends mongoose.Document {
  targetType: "status" | "storyChapter" | "anonymousMessage";
  targetId: string;
  storyId?: mongoose.Types.ObjectId;
  chapterId?: string;
  authorId: mongoose.Types.ObjectId;
  authorName: string;
  authorUsername: string;
  body: string;
  replyToCommentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<CommentDocument>(
  {
    targetType: { type: String, enum: ["status", "storyChapter", "anonymousMessage"], required: true, index: true },
    targetId: { type: String, required: true, index: true },
    storyId: { type: Schema.Types.ObjectId, ref: "Story", index: true },
    chapterId: { type: String },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorName: { type: String, required: true, trim: true },
    authorUsername: { type: String, required: true, trim: true, lowercase: true },
    body: { type: String, required: true, trim: true },
    replyToCommentId: { type: String }
  },
  { timestamps: true }
);

commentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const CommentModel = mongoose.model<CommentDocument>("Comment", commentSchema);
