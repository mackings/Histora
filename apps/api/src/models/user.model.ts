import mongoose, { Schema } from "mongoose";

export interface UserDocument extends mongoose.Document {
  fullName: string;
  username: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  emailVerifiedAt?: Date | null;
  verificationStatus: "none" | "pending" | "verified";
  verificationRequestedAt?: Date | null;
  verifiedAt?: Date | null;
  dateOfBirth?: Date;
  bio?: string;
  location?: string;
  avatarUrl?: string;
  subscriptionTier: "free" | "premium";
  profileVisibility: "public" | "selected" | "private";
  defaultStoryVisibility: "public" | "selected" | "private" | "anonymous";
  allowCommentsByDefault: boolean;
  allowHelpRequests: boolean;
  hideReadCounts: boolean;
  showAnonymousActivity: boolean;
  isAnonymousPostingEnabled: boolean;
  selectedViewerIds: mongoose.Types.ObjectId[];
}

const userSchema = new Schema<UserDocument>(
  {
    fullName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    verificationStatus: { type: String, enum: ["none", "pending", "verified"], default: "none", index: true },
    verificationRequestedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    dateOfBirth: { type: Date },
    bio: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    avatarUrl: { type: String, trim: true, default: "" },
    subscriptionTier: { type: String, enum: ["free", "premium"], default: "free" },
    profileVisibility: { type: String, enum: ["public", "selected", "private"], default: "public" },
    defaultStoryVisibility: {
      type: String,
      enum: ["public", "selected", "private", "anonymous"],
      default: "selected"
    },
    allowCommentsByDefault: { type: Boolean, default: true },
    allowHelpRequests: { type: Boolean, default: true },
    hideReadCounts: { type: Boolean, default: false },
    showAnonymousActivity: { type: Boolean, default: true },
    isAnonymousPostingEnabled: { type: Boolean, default: true },
    selectedViewerIds: [{ type: Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<UserDocument>("User", userSchema);
