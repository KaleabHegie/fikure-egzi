export const COURSE_DURATIONS = ['THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR'] as const
export type CourseDuration = (typeof COURSE_DURATIONS)[number]

/** Days in one run (Ethiopian months are 30 days); mirrors the API's default end date. */
export const DURATION_DAYS: Record<CourseDuration, number> = { THREE_MONTHS: 90, SIX_MONTHS: 180, ONE_YEAR: 365 }

export type RunPhase = 'upcoming' | 'ongoing' | 'finished'

interface Named {
  id: number
  nameEn: string
  nameAm: string
}

export interface Course extends Named {
  courseCode: string
  description: string | null
  duration: CourseDuration
  passMark: number
  departmentId: number
  department: Named
  isActive: boolean
  offeringCount: number
  createdAt: string
  updatedAt: string
}

export interface CourseInput {
  nameAm: string
  nameEn: string
  duration: CourseDuration
  departmentId: number
  passMark: number
  description: string | null
  isActive?: boolean
}

export interface CourseListParams {
  page: number
  pageSize: number
  search?: string
  departmentId?: number
  state?: 'active' | 'inactive'
}

/** A member as shown on course pages. */
export interface CoursePerson {
  id: number
  memberCode: string
  firstName: string
  fatherName: string
  grandfatherName: string | null
  christianName: string | null
  hasPhoto: boolean
  updatedAt: string
}

export interface Teacher {
  id: number
  fullName: string
  member: CoursePerson | null
}

export interface Assessment {
  id: number
  name: string
  maxScore: number
  sortOrder: number
}

/** One run of a course: a class grade, a period and its teachers. */
export interface CourseRun {
  id: number
  courseId: number
  classGradeId: number
  startDate: string
  endDate: string
  notes: string | null
  updatedAt: string
  phase: RunPhase
  course: Named & { courseCode: string; duration: CourseDuration; passMark: number; departmentId: number }
  classGrade: Named & { classType: Named }
  teachers: Teacher[]
  assessments: Assessment[]
  totalMax: number
  /** Present on single-run responses: may schedule / assign teachers. */
  canManage?: boolean
}

export interface RunInput {
  courseId: number
  classGradeId: number
  startDate: string
  endDate?: string
  teacherIds: number[]
  notes: string | null
}

export type Result = 'PASS' | 'FAIL'

export interface GradebookRow {
  member: CoursePerson
  /** False for former students who keep their marks. */
  inGrade: boolean
  marks: Record<number, number>
  total: number | null
  result: Result | null
}

export interface Gradebook {
  offering: CourseRun
  students: GradebookRow[]
}

export interface ScoreInput {
  assessmentId: number
  memberId: number
  score: number | null
}

export interface MemberCourseResult {
  id: number
  course: CourseRun['course']
  classGrade: CourseRun['classGrade']
  startDate: string
  endDate: string
  phase: RunPhase
  teachers: Teacher[]
  marks: { id: number; name: string; maxScore: number; score: number | null }[]
  total: number | null
  totalMax: number
  result: Result | null
}
