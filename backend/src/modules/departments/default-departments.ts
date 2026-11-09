/**
 * Starting department structure, created by `npm run db:seed` only when a
 * code does not exist yet. Admins rename/extend it on the Departments page,
 * and re-running the seed never overwrites their edits.
 */
export interface DefaultDepartment {
  code: string;
  nameEn: string;
  nameAm: string;
  descriptionEn?: string;
  descriptionAm?: string;
}

/** The administering office — root of the tree. */
export const OFFICE_DEPARTMENT: DefaultDepartment = {
  code: 'OFFICE',
  nameEn: 'Secretariat Office',
  nameAm: 'ፅህፈት ቤት',
  descriptionEn: 'Administers all departments of the Sunday school',
  descriptionAm: 'የሰንበት ትምህርት ቤቱን ክፍሎች በሙሉ የሚያስተዳድር',
};

/**
 * Departments administered by the office, as in the Sunday school's
 * "የክፍላት ተግባራት" document (their sub-departments are managed in the app).
 * Codes are permanent: renamed departments keep the code they were created
 * with (e.g. MEMBER_AFFAIRS is now Human Resource Administration).
 */
export const DEFAULT_DEPARTMENTS: readonly DefaultDepartment[] = [
  {
    code: 'PLANNING',
    nameEn: 'Planning, Implementation and Monitoring',
    nameAm: 'ዕቅድ ትግበራ እና ክትትል ዋና ክፍል',
  },
  { code: 'EDUCATION', nameEn: 'Education and Training', nameAm: 'ትምህርት እና ሥልጠና ክፍል' },
  { code: 'PROGRAMS', nameEn: 'Programs and Conferences', nameAm: 'የመርሐ ግብርና ጉባኤያት ክፍል' },
  { code: 'MEMBER_AFFAIRS', nameEn: 'Human Resource Administration', nameAm: 'የሰው ሀብት አስተዳደር ክፍል' },
  {
    code: 'MEDIA',
    nameEn: 'Information and Internal Communication',
    nameAm: 'የመረጃ እና የውስጥ ግንኙነት ክፍል',
  },
  {
    code: 'MEZMUR',
    nameEn: 'Mezmur and Festival Preparation',
    nameAm: 'የመዝሙር እና በዓላት ዝግጅት ክፍል',
  },
  { code: 'ARTS', nameEn: 'Arts', nameAm: 'የሥነ ጥበብ ክፍል' },
  { code: 'PRAYER_CHARITY', nameEn: 'Development and Charity', nameAm: 'የልማትና በጎ አድራጎት ክፍል' },
  { code: 'BUDGET', nameEn: 'Budget and Property Administration', nameAm: 'የበጀትና ንብረት አስተዳደር ክፍል' },
];
