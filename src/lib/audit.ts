import { prisma } from "./db";

type AuditInput = {
  studyId: string;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: string;
};

export async function audit(input: AuditInput) {
  await prisma.auditEvent.create({ data: input });
}
