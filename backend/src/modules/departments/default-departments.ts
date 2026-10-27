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

/** Departments administered by the office, in the Sunday school's own structure chart. */
export const DEFAULT_DEPARTMENTS: readonly DefaultDepartment[] = [
  { code: 'EDUCATION', nameEn: 'Education', nameAm: 'ትምህርት ክፍል' },
  {
    code: 'MEMBER_AFFAIRS',
    nameEn: 'Member Affairs & Programs',
    nameAm: 'አባላት ጉዳይ እና መርሐ ግብር ክፍል',
  },
  { code: 'MEZMUR', nameEn: 'Mezmur (Hymns)', nameAm: 'መዝሙር ክፍል' },
  { code: 'ARTS', nameEn: 'Arts', nameAm: 'ሥነ-ጥበብ ክፍል' },
  {
    code: 'PROFESSIONAL_SERVICES',
    nameEn: 'Professional Services Coordination',
    nameAm: 'የሙያ አገልግሎት ማስተባበሪያ ክፍል',
  },
  { code: 'PRAYER_CHARITY', nameEn: 'Prayer & Charity', nameAm: 'ጸሎት እና በጎ አድራጎት ክፍል' },
  { code: 'CHILDREN', nameEn: 'Children', nameAm: 'ሕጻናት ክፍል' },
  { code: 'MEDIA', nameEn: 'Media & Communications', nameAm: 'የመገናኛ ብዙኃን ክፍል' },
];
