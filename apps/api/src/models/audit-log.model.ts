import mongoose, { Schema } from "mongoose";

export interface AuditLogDocument extends mongoose.Document {
  actorUserId?: mongoose.Types.ObjectId | null;
  targetUserId?: mongoose.Types.ObjectId | null;
  entityType: "anonymousMessage" | "session" | "mediaUpload" | "auth" | "status";
  entityId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    entityType: {
      type: String,
      enum: ["anonymousMessage", "session", "mediaUpload", "auth", "status"],
      required: true,
      index: true
    },
    entityId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const AuditLogModel = mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema);
