import { AuditLogModel } from "../models/audit-log.model.js";

type AuditInput = {
  actorUserId?: string | null;
  targetUserId?: string | null;
  entityType: "anonymousMessage" | "session" | "mediaUpload" | "auth" | "status";
  entityId: string;
  action: string;
  metadata?: Record<string, unknown>;
};

export async function recordAuditEvent(input: AuditInput) {
  await AuditLogModel.create({
    actorUserId: input.actorUserId ?? null,
    targetUserId: input.targetUserId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    metadata: input.metadata ?? {}
  });
}
