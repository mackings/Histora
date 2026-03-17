import mongoose, { Schema } from "mongoose";

export interface UserDocument extends mongoose.Document {
  fullName: string;
  username: string;
  email: string;
  passwordHash: string;
  subscriptionTier: "free" | "premium";
  isAnonymousPostingEnabled: boolean;
  selectedViewerIds: mongoose.Types.ObjectId[];
}

const userSchema = new Schema<UserDocument>(
  {
    fullName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    subscriptionTier: { type: String, enum: ["free", "premium"], default: "free" },
    isAnonymousPostingEnabled: { type: Boolean, default: true },
    selectedViewerIds: [{ type: Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<UserDocument>("User", userSchema);
