/** Mirrors the API's exams (a department's own exams, not tied to a course). */

export type ExamResult = 'PASS' | 'FAIL'

/** One scored part, e.g. እንቅስቃሴ 40 / ዜማ 60. Marks are given out of its weight. */
export interface ExamPart {
  id: number
  name: string
  weight: number
  sortOrder: number
}

export interface Exam {
  id: number
  departmentId: number
  nameAm: string
  nameEn: string | null
  description: string | null
  heldOn: string | null
  passMark: number
  department: { id: number; nameAm: string; nameEn: string }
  parts: ExamPart[]
  /** Sum of the weights; results are given once it is exactly 100. */
  totalWeight: number
  candidateCount: number
  /** Candidates with every part marked. */
  markedCount: number
  passedCount: number
  canManage: boolean
  createdAt: string
  updatedAt: string
}

export interface ExamInput {
  departmentId: number
  nameAm: string
  nameEn: string | null
  description: string | null
  heldOn: string | null
  passMark: number
}

export interface ExamPartInput {
  id?: number
  name: string
  weight: number
}

export interface ExamMember {
  id: number
  memberCode: string
  firstName: string
  fatherName: string
  grandfatherName: string | null
  christianName: string | null
  hasPhoto: boolean
  updatedAt: string
}

export interface ExamCandidateRow {
  member: ExamMember
  /** partId → mark */
  marks: Record<number, number>
  total: number | null
  result: ExamResult | null
}

export interface ExamSheet {
  exam: Exam
  candidates: ExamCandidateRow[]
}

export interface ExamMarkInput {
  partId: number
  memberId: number
  score: number | null
}

export interface CandidateSearchResult extends ExamMember {
  isCandidate: boolean
}

/** GET /exams/member/:id — a member's exams with their marks. */
export interface MemberExam {
  id: number
  nameAm: string
  nameEn: string | null
  heldOn: string | null
  passMark: number
  department: { id: number; nameAm: string; nameEn: string }
  parts: (ExamPart & { score: number | null })[]
  total: number | null
  result: ExamResult | null
}

export interface ExamListParams {
  search?: string
  departmentId?: number
}
