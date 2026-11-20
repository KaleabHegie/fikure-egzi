import { PERMISSIONS, SYSTEM_ROLES } from './permissions.js';

const role = (code: string) => {
  const found = SYSTEM_ROLES.find((r) => r.code === code);
  if (!found) throw new Error(`No role ${code}`);
  return found;
};

describe('SYSTEM_ROLES', () => {
  it.each([
    // Attendance admins also edit their departments' members.
    ['ATTENDANCE_ADMIN', ['attendance.', 'members.update']],
    ['EXAM_TAKER', ['exams.']],
  ])('%s views its department and works only in its own area', (code, areas) => {
    const r = role(code);
    expect(r.departmentScoped).toBe(true);
    // Departments, members and classes: view only.
    expect(r.permissions).toEqual(
      expect.arrayContaining([
        PERMISSIONS.DEPARTMENTS_READ,
        PERMISSIONS.MEMBERS_READ,
        PERMISSIONS.CLASSES_READ,
      ]),
    );
    const views: string[] = [
      PERMISSIONS.DEPARTMENTS_READ,
      PERMISSIONS.MEMBERS_READ,
      PERMISSIONS.CLASSES_READ,
    ];
    const rest = r.permissions.filter((p) => !views.includes(p));
    expect(rest.length).toBeGreaterThan(0);
    for (const p of rest) expect(areas.some((a) => p.startsWith(a))).toBe(true);
    // No dashboard, so the sidebar shows nothing else.
    expect(r.permissions).not.toContain(PERMISSIONS.DASHBOARD_READ);
  });

  it('lets attendance admins edit members but not add or delete them', () => {
    const r = role('ATTENDANCE_ADMIN');
    expect(r.permissions).toContain(PERMISSIONS.MEMBERS_UPDATE);
    expect(r.permissions).not.toContain(PERMISSIONS.MEMBERS_CREATE);
    expect(r.permissions).not.toContain(PERMISSIONS.MEMBERS_DELETE);
    expect(role('EXAM_TAKER').permissions).not.toContain(PERMISSIONS.MEMBERS_UPDATE);
  });

  it('keeps the dashboard for the administrators', () => {
    for (const code of ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'DEPARTMENT_ADMIN']) {
      expect(role(code).permissions).toContain(PERMISSIONS.DASHBOARD_READ);
    }
  });
});
