import { memberSearchWhere } from './member-search.js';

const conditions = (term: string) => memberSearchWhere(term).OR as Record<string, unknown>[];

describe('memberSearchWhere', () => {
  it('looks through every text field, not just names', () => {
    const fields = conditions('Bole').flatMap((c) => Object.keys(c));
    for (const field of [
      'firstName',
      'subCity',
      'occupation',
      'spiritualFatherName',
      'emergencyContactName',
      'notes',
    ]) {
      expect(fields).toContain(field);
    }
    expect(conditions('Bole')).toContainEqual({ subCity: { contains: 'Bole' } });
  });

  it('finds an education level by its Amharic or English name', () => {
    expect(conditions('ዲግሪ')).toContainEqual({ educationLevel: { in: ['BACHELORS', 'MASTERS'] } });
    expect(conditions('diploma')).toContainEqual({ educationLevel: { in: ['DIPLOMA'] } });
  });

  it('finds gender and marital status by name', () => {
    expect(conditions('ሴት')).toContainEqual({ gender: { in: ['FEMALE'] } });
    expect(conditions('married')).toContainEqual({ maritalStatus: { in: ['MARRIED'] } });
  });

  it('adds no choice filter when the word names no choice', () => {
    const fields = conditions('0911223344').flatMap((c) => Object.keys(c));
    expect(fields).not.toContain('educationLevel');
    expect(fields).not.toContain('gender');
  });

  it('matches department and class names', () => {
    const where = conditions('መዝሙር');
    expect(where).toContainEqual({
      departmentRoles: {
        some: {
          department: { OR: [{ nameAm: { contains: 'መዝሙር' } }, { nameEn: { contains: 'መዝሙር' } }] },
        },
      },
    });
    expect(where.some((c) => 'classEnrollments' in c)).toBe(true);
  });
});
