import type { DepartmentRole } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Writes to the append-only history tables. Always call these with the
 * transaction client of the change they record, so the current-state row and
 * its history commit (or roll back) together.
 */
type Tx = Prisma.TransactionClient;

export async function openClassPeriods(
  tx: Tx,
  rows: { memberId: number; classTypeId: number; classGradeId: number }[],
  startedAt: Date,
  recordedById: number,
): Promise<void> {
  if (rows.length === 0) return;
  await tx.classPlacementHistory.createMany({
    data: rows.map((r) => ({ ...r, startedAt, recordedById })),
  });
}

/** Ends the member's open periods in the given class types (all types when omitted). */
export async function closeClassPeriods(
  tx: Tx,
  memberId: number,
  endedAt: Date,
  classTypeIds?: number[],
): Promise<void> {
  if (classTypeIds && classTypeIds.length === 0) return;
  await tx.classPlacementHistory.updateMany({
    where: { memberId, endedAt: null, ...(classTypeIds && { classTypeId: { in: classTypeIds } }) },
    data: { endedAt },
  });
}

export async function openServicePeriod(
  tx: Tx,
  row: { memberId: number; departmentId: number; role: DepartmentRole },
  startedAt: Date,
  recordedById: number,
): Promise<void> {
  await tx.departmentServiceHistory.create({ data: { ...row, startedAt, recordedById } });
}

/** Ends the member's open service period(s): in one department, or all when omitted. */
export async function closeServicePeriods(
  tx: Tx,
  memberId: number,
  endedAt: Date,
  departmentId?: number,
): Promise<void> {
  await tx.departmentServiceHistory.updateMany({
    where: { memberId, endedAt: null, ...(departmentId !== undefined && { departmentId }) },
    data: { endedAt },
  });
}
