import type { Prisma } from '../../generated/prisma/client.js';

/** Every free-text column on a member record. */
const TEXT_FIELDS = [
  'memberCode',
  'firstName',
  'fatherName',
  'grandfatherName',
  'christianName',
  'placeOfBirth',
  'phone',
  'alternatePhone',
  'email',
  'city',
  'subCity',
  'woreda',
  'kebele',
  'houseNumber',
  'occupation',
  'spiritualFatherName',
  'emergencyContactName',
  'emergencyContactPhone',
  'emergencyContactRelation',
  'healthConditionNote',
  'notes',
] as const satisfies readonly (keyof Prisma.MemberWhereInput)[];

/**
 * The words people see for each stored choice, in English and Amharic
 * (mirrors the web app's `enums` translations), so typing "ዲግሪ" or
 * "female" finds members by their education level or gender.
 */
const CHOICE_LABELS = {
  gender: { MALE: ['Male', 'ወንድ'], FEMALE: ['Female', 'ሴት'] },
  status: { ACTIVE: ['Active', 'ንቁ'], INACTIVE: ['Inactive', 'ንቁ ያልሆነ'] },
  maritalStatus: {
    SINGLE: ['Single', 'ያላገባ'],
    MARRIED: ['Married', 'ያገባ'],
    DIVORCED: ['Divorced', 'የተፋታ'],
    WIDOWED: ['Widowed', 'የትዳር አጋሩን ያጣ'],
  },
  educationLevel: {
    NONE: ['No formal education', 'መደበኛ ትምህርት የለም'],
    PRIMARY: ['Primary', 'የመጀመሪያ ደረጃ'],
    SECONDARY: ['Secondary', 'ሁለተኛ ደረጃ'],
    CERTIFICATE: ['Certificate', 'ሰርተፍኬት'],
    DIPLOMA: ['Diploma', 'ዲፕሎማ'],
    BACHELORS: ["Bachelor's degree", 'የመጀመሪያ ዲግሪ'],
    MASTERS: ["Master's degree", 'ሁለተኛ ዲግሪ'],
    DOCTORATE: ['Doctorate', 'ዶክትሬት'],
    OTHER: ['Other', 'ሌላ'],
  },
} as const;

const named = (term: string) => ({
  OR: [{ nameAm: { contains: term } }, { nameEn: { contains: term } }],
});

/**
 * Members matching one search word anywhere: any text field, a choice shown
 * by name (gender, status, marital status, education), or the name of a
 * department they serve in or a class level they are placed in.
 */
export function memberSearchWhere(term: string): Prisma.MemberWhereInput {
  const lower = term.toLowerCase();
  const choices = Object.entries(CHOICE_LABELS).flatMap(([field, options]) => {
    const values = Object.entries(options as Record<string, readonly string[]>)
      .filter(([, labels]) => labels.some((label) => label.toLowerCase().includes(lower)))
      .map(([value]) => value);
    return values.length > 0 ? [{ [field]: { in: values } }] : [];
  });
  return {
    OR: [
      ...TEXT_FIELDS.map((field) => ({ [field]: { contains: term } })),
      ...choices,
      { departmentRoles: { some: { department: named(term) } } },
      {
        classEnrollments: {
          some: { classGrade: { OR: [named(term), { classType: named(term) }] } },
        },
      },
    ],
  };
}
