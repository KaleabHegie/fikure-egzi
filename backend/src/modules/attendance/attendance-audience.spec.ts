import { rosterWhere, sessionGroupIds } from './attendance.service.js';

describe('service-group session audience', () => {
  const base = { classGradeId: null, departmentId: null };

  it('covers the main group and any extra groups, once each', () => {
    expect(sessionGroupIds({ serviceGroupId: 4, extraServiceGroupIds: [5, 4, 6] })).toEqual([
      4, 5, 6,
    ]);
    expect(sessionGroupIds({ serviceGroupId: 4, extraServiceGroupIds: null })).toEqual([4]);
  });

  it('expects the members of every covered group', () => {
    const where = rosterWhere({ ...base, serviceGroupId: 4, extraServiceGroupIds: [5] });
    expect(where.serviceGroups).toEqual({ some: { groupId: { in: [4, 5] } } });
  });
});
