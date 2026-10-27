/** Mirrors GET /class-types. Class types and grades are admin-managed data. */
export interface ClassGrade {
  id: number
  classTypeId: number
  code: string
  nameEn: string
  nameAm: string
  shortLabel: string | null
  sortOrder: number
  isActive: boolean
  memberCount: number
}

export interface ClassType {
  id: number
  code: string
  nameEn: string
  nameAm: string
  descriptionEn: string | null
  descriptionAm: string | null
  sortOrder: number
  isActive: boolean
  /** Department that runs the class (its admins/attendance takers handle its attendance). */
  departmentId: number
  department: { id: number; nameEn: string; nameAm: string }
  memberCount: number
  grades: ClassGrade[]
}

/** A member's placement in one class type (part of the Member payload). */
export interface MemberClass {
  classType: Pick<ClassType, 'id' | 'code' | 'nameEn' | 'nameAm'>
  classGrade: Pick<ClassGrade, 'id' | 'code' | 'nameEn' | 'nameAm' | 'shortLabel' | 'isActive'>
  assignedAt: string
}

export interface ClassTypeInput {
  code: string
  nameEn: string
  nameAm: string
  descriptionEn: string | null
  descriptionAm: string | null
  departmentId: number
  isActive: boolean
}

export interface ClassGradeInput {
  code: string
  nameEn: string
  nameAm: string
  shortLabel: string | null
  isActive: boolean
}
