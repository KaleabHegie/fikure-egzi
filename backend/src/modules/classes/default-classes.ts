/**
 * Starting class structure, created by `npm run db:seed` only when a type's
 * code does not exist yet. After that the data belongs to the admins (Classes
 * page), so re-running the seed never overwrites their edits.
 */
export interface DefaultClassType {
  code: string;
  nameEn: string;
  nameAm: string;
  descriptionEn?: string;
  descriptionAm?: string;
  /** Code of the department that runs the class (linked when the class is first created). */
  departmentCode: string;
  grades: { code: string; nameEn: string; nameAm: string; shortLabel?: string }[];
}

export const DEFAULT_CLASS_TYPES: readonly DefaultClassType[] = [
  {
    code: 'MEZMUR',
    departmentCode: 'MEZMUR',
    nameEn: 'Mezmur Class',
    nameAm: 'የመዝሙር ክፍል',
    descriptionEn: 'Hymn (mezmur) training by chant mode',
    descriptionAm: 'የመዝሙር ትምህርት በዜማ ስልት',
    grades: [
      { code: 'GEEZ', nameEn: "Ge'ez", nameAm: 'ግዕዝ', shortLabel: 'ሐ' },
      { code: 'EZEL', nameEn: 'Ezel', nameAm: 'ዕዝል', shortLabel: 'ለ' },
      { code: 'ARARAY', nameEn: 'Araray', nameAm: 'አራራይ', shortLabel: 'ሀ' },
    ],
  },
  {
    code: 'COURSE',
    departmentCode: 'EDUCATION',
    nameEn: 'Course Class',
    nameAm: 'የኮርስ ክፍል',
    descriptionEn: 'Spiritual education course, grades 1–12',
    descriptionAm: 'የመንፈሳዊ ትምህርት ኮርስ ከ1ኛ እስከ 12ኛ ክፍል',
    grades: Array.from({ length: 12 }, (_, i) => ({
      code: `G${String(i + 1).padStart(2, '0')}`,
      nameEn: `Grade ${i + 1}`,
      nameAm: `${i + 1}ኛ ክፍል`,
      shortLabel: String(i + 1),
    })),
  },
];
