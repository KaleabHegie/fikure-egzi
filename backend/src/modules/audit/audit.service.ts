import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';

export interface AuditEntry {
  userId: number | null;
  action: AuditAction;
  entity: string;
  entityId?: string | number;
  changes?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

/**
 * Shared audit trail. Pass the transaction client when logging inside a
 * transaction so the audit row commits (or rolls back) with the change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId === undefined ? null : String(entry.entityId),
        changes: entry.changes,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }
}
