import { jest } from '@jest/globals';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { auditTargets } from './audit-targets.js';

const found = (rows: unknown[]) =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(rows);

describe('auditTargets', () => {
  it('names members with their ID, users with their email, and skips what is gone', async () => {
    const prisma = {
      member: {
        findMany: found([
          {
            id: 12,
            memberCode: 'FE-00012',
            firstName: 'አበባ',
            fatherName: 'ብርሃኑ',
            grandfatherName: 'ወልዴ',
          },
        ]),
      },
      user: { findMany: found([{ id: 8, fullName: 'ቃለአብ ህገ መንግስት', email: 'a@b.c' }]) },
    };
    const targets = await auditTargets(prisma as unknown as PrismaService, [
      { entity: 'Member', entityId: '12' },
      { entity: 'User', entityId: '8' },
      { entity: 'User', entityId: '99' },
      { entity: 'Settings', entityId: null },
    ]);
    expect(targets.get('Member:12')).toEqual({
      am: 'አበባ ብርሃኑ ወልዴ',
      en: 'አበባ ብርሃኑ ወልዴ',
      code: 'FE-00012',
    });
    expect(targets.get('User:8')).toEqual({
      am: 'ቃለአብ ህገ መንግስት',
      en: 'ቃለአብ ህገ መንግስት',
      code: 'a@b.c',
    });
    expect(targets.has('User:99')).toBe(false);
    // One query per kind of record, for every id on the page at once.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: { in: [8, 99] } },
    });
  });
});
