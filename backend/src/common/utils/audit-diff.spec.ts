import { auditDiff, auditSnapshot } from './audit-diff.js';

describe('auditDiff', () => {
  it('keeps each changed field from before to after, and skips unchanged ones and secrets', () => {
    const before = { phone: '0911', city: 'Addis', joinedAt: new Date('2026-01-01T00:00:00Z') };
    const after = { phone: '0922', city: 'Addis', joinedAt: new Date('2026-02-01T00:00:00Z') };
    const dto = { phone: '0922', city: 'Addis', joinedAt: '2026-02-01', password: 'x' };
    expect(auditDiff(before, after, dto)).toEqual({
      fields: ['phone', 'joinedAt'],
      diff: {
        phone: { from: '0911', to: '0922' },
        joinedAt: { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' },
      },
    });
  });

  it('keeps only the new value of a field that is not a column', () => {
    expect(auditDiff({ id: 1 }, { id: 1 }, { departmentIds: [4, 2] }).diff).toEqual({
      departmentIds: { to: [4, 2] },
    });
  });

  it('turns decimals into numbers', () => {
    const dec = (n: number) => ({ toNumber: () => n });
    expect(auditDiff({ weight: dec(40) }, { weight: dec(60) }, { weight: 60 }).diff).toEqual({
      weight: { from: 40, to: 60 },
    });
  });
});

describe('auditSnapshot', () => {
  it("keeps the record's own values, not links, secrets, bookkeeping or blanks", () => {
    expect(
      auditSnapshot({
        id: 3,
        fullName: 'Abebe',
        passwordHash: 'h',
        createdAt: new Date(),
        notes: null,
        roles: [{ id: 1 }],
        tags: ['a', 'b'],
        department: { id: 4 },
      }),
    ).toEqual({ id: 3, fullName: 'Abebe', tags: ['a', 'b'] });
  });
});
