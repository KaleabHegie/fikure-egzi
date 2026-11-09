import { toAuthenticatedUser, type UserWithAccess } from './user-principal.js';

const role = (code: string, departmentScoped: boolean) => ({
  role: { code, departmentScoped, permissions: [{ permission: { code: 'members.read' } }] },
});

const user = (over: Partial<Record<string, unknown>>) =>
  ({
    id: 1,
    email: 'admin@example.org',
    fullName: 'Admin',
    roles: [role('DEPARTMENT_ADMIN', true)],
    departments: [],
    ...over,
  }) as unknown as UserWithAccess;

describe('toAuthenticatedUser', () => {
  it("covers an assigned department's sub-departments and their sections", () => {
    const principal = toAuthenticatedUser(
      user({
        departments: [
          {
            departmentId: 9,
            department: {
              children: [
                { id: 20, children: [] },
                { id: 21, children: [{ id: 30 }, { id: 31 }] },
              ],
            },
          },
          { departmentId: 4, department: { children: [] } },
        ],
      }),
    );
    expect(principal.departmentIds).toEqual([4, 9, 20, 21, 30, 31]);
  });

  it('leaves office administrators unrestricted', () => {
    const principal = toAuthenticatedUser(
      user({ roles: [role('SUPER_ADMIN', false)], departments: [{ departmentId: 4 }] }),
    );
    expect(principal.departmentIds).toBeNull();
  });
});
