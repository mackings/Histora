import mongoose, { Schema } from "mongoose";

export interface EmailVerificationTokenDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  codeHash: string;
  expiresAt: Date;
  failedAttempts: number;
  lastAttemptAt?: Date | null;
  consumedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const emailVerificationTokenSchema = new Schema<EmailVerificationTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    failedAttempts: { type: Number, required: true, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const EmailVerificationTokenModel = mongoose.model<EmailVerificationTokenDocument>(
  "EmailVerificationToken",
  emailVerificationTokenSchema
);
