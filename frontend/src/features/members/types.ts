import type { MemberClass } from '@/features/classes/types'
import type { DepartmentRole, MemberDepartment } from '@/features/departments/types'
import type { SortOrder } from '@/lib/api/types'

export const GENDERS = ['MALE', 'FEMALE'] as const
export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const
export const MEMBERSHIP_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export const EDUCATION_LEVELS = [
  'NONE',
  'PRIMARY',
  'SECONDARY',
  'CERTIFICATE',
  'DIPLOMA',
  'BACHELORS',
  'MASTERS',
  'DOCTORATE',
  'OTHER',
] as const

export type Gender = (typeof GENDERS)[number]
export type MaritalStatus = (typeof MARITAL_STATUSES)[number]
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]

interface UserRef {
  id: number
  fullName: string
}

/** Mirrors the API's MemberDto. Dates arrive as ISO strings. */
export interface Member {
  id: number
  memberCode: string
  firstName: string
  fatherName: string
  grandfatherName: string | null
  christianName: string | null
  gender: Gender
  dateOfBirth: string | null
  placeOfBirth: string | null
  maritalStatus: MaritalStatus | null
  phone: string | null
  alternatePhone: string | null
  email: string | null
  city: string | null
  subCity: string | null
  woreda: string | null
  kebele: string | null
  houseNumber: string | null
  educationLevel: EducationLevel | null
  occupation: string | null
  spiritualFatherName: string | null
  status: MembershipStatus
  joinedAt: string
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelation: string | null
  /** Fetch the image with useMemberPhoto(); it is served only to signed-in users. */
  hasPhoto: boolean
  /** Current grade per class type, in class-type order. */
  classes: MemberClass[]
  /** Departments the member serves in, with their role. */
  departments: MemberDepartment[]
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy: UserRef | null
  updatedBy: UserRef | null
}

export type MemberSortField = 'createdAt' | 'firstName' | 'memberCode' | 'joinedAt'

export interface MemberListParams {
  page: number
  pageSize: number
  search?: string
  gender?: Gender
  status?: MembershipStatus
  classGradeId?: number
  departmentId?: number
  sortBy?: MemberSortField
  sortOrder?: SortOrder
}

export interface CountByKey<K extends string = string> {
  key: K
  count: number
}

export interface MemberStats {
  total: number
  byStatus: CountByKey<MembershipStatus>[]
  byGender: CountByKey<Gender>[]
  servingInDepartments: number
  placedInClasses: number
  /** Gregorian join dates (last ~13 months) with counts; bucket into E.C. months client-side. */
  joinedByDay: { date: string; count: number }[]
}

/** GET /members/:id/history — periods newest first; endedAt null = current. */
export interface ClassPeriod {
  id: number
  startedAt: string
  endedAt: string | null
  classType: { id: number; code: string; nameEn: string; nameAm: string }
  classGrade: { id: number; code: string; nameEn: string; nameAm: string; shortLabel: string | null }
}

export interface ServicePeriod {
  id: number
  role: DepartmentRole
  startedAt: string
  endedAt: string | null
  department: { id: number; code: string; nameEn: string; nameAm: string }
}

export interface MemberHistory {
  classes: ClassPeriod[]
  departments: ServicePeriod[]
}

/** POST /members/import/preview — see backend MemberImportService. */
export type ImportIssueCode =
  | 'required'
  | 'invalidOption'
  | 'invalidDate'
  | 'dateAsNumber'
  | 'futureDate'
  | 'invalidPhone'
  | 'invalidEmail'
  | 'tooLong'
  | 'seatTaken'
  | 'roleWithoutDepartment'
  | 'duplicateInFile'
  | 'duplicateName'
  | 'possibleDuplicate'
  | 'invalid'

export interface ImportIssue {
  column: string | null
  code: ImportIssueCode
  params?: Record<string, string | number>
  message?: string
}

export interface ImportPreview {
  totalRows: number
  validRows: number
  errorRows: number
  warningRows: number
  columns: { key: string; en: string; am: string }[]
  rows: { row: number; name: string; errors: ImportIssue[]; warnings: ImportIssue[] }[]
}
