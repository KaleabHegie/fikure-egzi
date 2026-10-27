import {
  DepartmentRole,
  EducationLevel,
  Gender,
  MaritalStatus,
  MembershipStatus,
} from '../../../generated/prisma/enums.js';

export type ImportLang = 'en' | 'am';
type Bilingual = Record<ImportLang, string>;

/** Fixed (non-dynamic) columns of the import template, in sheet order. */
export type FixedColumnKey =
  | 'firstName'
  | 'fatherName'
  | 'grandfatherName'
  | 'christianName'
  | 'gender'
  | 'dateOfBirth'
  | 'placeOfBirth'
  | 'joinedAt'
  | 'maritalStatus'
  | 'status'
  | 'phone'
  | 'alternatePhone'
  | 'email'
  | 'city'
  | 'subCity'
  | 'woreda'
  | 'kebele'
  | 'houseNumber'
  | 'educationLevel'
  | 'occupation'
  | 'spiritualFatherName'
  | 'emergencyContactName'
  | 'emergencyContactRelation'
  | 'emergencyContactPhone'
  | 'department'
  | 'departmentRole'
  | 'notes';

export type ColumnKind = 'text' | 'ecDate' | 'phone' | 'enum' | 'class' | 'department' | 'role';

export interface ColumnDef {
  /** 'class:<classTypeId>' for the dynamic class columns. */
  key: string;
  header: Bilingual;
  kind: ColumnKind;
  required?: boolean;
  width: number;
}

const t = (en: string, am: string): Bilingual => ({ en, am });

export const ENUM_LABELS = {
  gender: { [Gender.MALE]: t('Male', 'ወንድ'), [Gender.FEMALE]: t('Female', 'ሴት') },
  maritalStatus: {
    [MaritalStatus.SINGLE]: t('Single', 'ያላገባ'),
    [MaritalStatus.MARRIED]: t('Married', 'ያገባ'),
    [MaritalStatus.DIVORCED]: t('Divorced', 'የተፋታ'),
    [MaritalStatus.WIDOWED]: t('Widowed', 'የትዳር አጋሩን ያጣ'),
  },
  status: {
    [MembershipStatus.ACTIVE]: t('Active', 'ንቁ'),
    [MembershipStatus.INACTIVE]: t('Inactive', 'ንቁ ያልሆነ'),
  },
  educationLevel: {
    [EducationLevel.NONE]: t('No formal education', 'መደበኛ ትምህርት የለም'),
    [EducationLevel.PRIMARY]: t('Primary', 'የመጀመሪያ ደረጃ'),
    [EducationLevel.SECONDARY]: t('Secondary', 'ሁለተኛ ደረጃ'),
    [EducationLevel.CERTIFICATE]: t('Certificate', 'ሰርተፍኬት'),
    [EducationLevel.DIPLOMA]: t('Diploma', 'ዲፕሎማ'),
    [EducationLevel.BACHELORS]: t("Bachelor's degree", 'የመጀመሪያ ዲግሪ'),
    [EducationLevel.MASTERS]: t("Master's degree", 'ሁለተኛ ዲግሪ'),
    [EducationLevel.DOCTORATE]: t('Doctorate', 'ዶክትሬት'),
    [EducationLevel.OTHER]: t('Other', 'ሌላ'),
  },
  departmentRole: {
    [DepartmentRole.HEAD]: t('Head', 'ሰብሳቢ'),
    [DepartmentRole.DEPUTY]: t('Deputy head', 'ምክትል ሰብሳቢ'),
    [DepartmentRole.SECRETARY]: t('Secretary', 'ጸሐፊ'),
    [DepartmentRole.MEMBER]: t('Member', 'አባል'),
  },
} as const;

export type EnumColumn = keyof typeof ENUM_LABELS;

const col = (
  key: FixedColumnKey,
  en: string,
  am: string,
  kind: ColumnKind,
  width: number,
  required = false,
): ColumnDef => ({ key, header: t(en, am), kind, width, required });

/** Columns before the dynamic class columns. */
export const LEADING_COLUMNS: ColumnDef[] = [
  col('firstName', 'First name', 'ስም', 'text', 16, true),
  col('fatherName', "Father's name", 'የአባት ስም', 'text', 16, true),
  col('grandfatherName', "Grandfather's name", 'የአያት ስም', 'text', 16),
  col('christianName', 'Christian name', 'የክርስትና ስም', 'text', 16),
  col('gender', 'Gender', 'ጾታ', 'enum', 10, true),
  col(
    'dateOfBirth',
    'Date of birth (E.C. dd/mm/yyyy)',
    'የትውልድ ቀን (ዓ.ም ቀን/ወር/ዓመት)',
    'ecDate',
    20,
    true,
  ),
  col('placeOfBirth', 'Place of birth', 'የትውልድ ቦታ', 'text', 14),
  col('joinedAt', 'Join date (E.C. dd/mm/yyyy)', 'የተቀላቀሉበት ቀን (ዓ.ም)', 'ecDate', 18),
  col('maritalStatus', 'Marital status', 'የጋብቻ ሁኔታ', 'enum', 14),
  col('status', 'Status', 'ሁኔታ', 'enum', 12),
  col('phone', 'Phone', 'ስልክ', 'phone', 14),
  col('alternatePhone', 'Alternate phone', 'ተጨማሪ ስልክ', 'phone', 14),
  col('email', 'Email', 'ኢሜይል', 'text', 22),
  col('city', 'City', 'ከተማ', 'text', 14),
  col('subCity', 'Sub-city', 'ክፍለ ከተማ', 'text', 14),
  col('woreda', 'Woreda', 'ወረዳ', 'text', 8),
  col('kebele', 'Kebele', 'ቀበሌ', 'text', 8),
  col('houseNumber', 'House number', 'የቤት ቁጥር', 'text', 10),
  col('educationLevel', 'Education level', 'የትምህርት ደረጃ', 'enum', 18),
  col('occupation', 'Occupation', 'ሥራ', 'text', 14),
  col('spiritualFatherName', 'Spiritual father', 'የንስሐ አባት', 'text', 18),
  col('emergencyContactName', 'Emergency contact', 'የአደጋ ጊዜ ተጠሪ', 'text', 18),
  col('emergencyContactRelation', 'Relationship', 'ዝምድና', 'text', 12),
  col('emergencyContactPhone', 'Emergency phone', 'የተጠሪ ስልክ', 'phone', 14),
];

/** Columns after the dynamic class columns. */
export const TRAILING_COLUMNS: ColumnDef[] = [
  col('department', 'Department', 'የአገልግሎት ክፍል', 'department', 22),
  col('departmentRole', 'Department role', 'ኃላፊነት', 'role', 14),
  col('notes', 'Notes', 'ማስታወሻ', 'text', 30),
];

/** The enum each 'enum'/'role' column maps through. */
export const ENUM_COLUMN: Partial<Record<string, EnumColumn>> = {
  gender: 'gender',
  maritalStatus: 'maritalStatus',
  status: 'status',
  educationLevel: 'educationLevel',
  departmentRole: 'departmentRole',
};

/** Normalizes a dropdown value for matching: trims, collapses spaces, lowercases. */
export { normalizeLabel } from '../../../common/utils/excel.js';
