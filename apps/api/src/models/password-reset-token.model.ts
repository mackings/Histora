import mongoose, { Schema } from "mongoose";

export interface PasswordResetTokenDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  codeHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetTokenSchema = new Schema<PasswordResetTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    codeHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const PasswordResetTokenModel = mongoose.model<PasswordResetTokenDocument>(
  "PasswordResetToken",
  passwordResetTokenSchema
);
