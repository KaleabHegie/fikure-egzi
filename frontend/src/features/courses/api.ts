import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, http } from '@/lib/api/client'
import type { PaginationMeta } from '@/lib/api/types'
import type {
  Course,
  CourseInput,
  CourseListParams,
  CourseRun,
  Gradebook,
  MemberCourseResult,
  RunInput,
  RunPhase,
  ScoreInput,
  Teacher,
} from './types'

export const courseKeys = {
  all: ['courses'] as const,
  list: (p: CourseListParams) => [...courseKeys.all, 'list', p] as const,
  detail: (id: number) => [...courseKeys.all, 'detail', id] as const,
  runs: (p: RunListParams) => [...courseKeys.all, 'runs', p] as const,
  run: (id: number) => [...courseKeys.all, 'run', id] as const,
  marks: (id: number) => [...courseKeys.all, 'marks', id] as const,
  teachers: () => [...courseKeys.all, 'teachers'] as const,
  member: (memberId: number) => [...courseKeys.all, 'member', memberId] as const,
}

export interface RunListParams {
  courseId?: number
  phase?: RunPhase
  mine?: boolean
}

export const coursesApi = {
  list: (p: CourseListParams) =>
    http.get<{ data: Course[]; meta: PaginationMeta }>('/courses', { params: p }).then((r) => r.data),
  get: (id: number) => api.get<Course>(`/courses/${id}`),
  create: (input: CourseInput) => api.post<Course>('/courses', input),
  update: (id: number, input: Partial<CourseInput>) => api.patch<Course>(`/courses/${id}`, input),
  remove: (id: number) => api.delete(`/courses/${id}`),
  teachers: () => api.get<Teacher[]>('/courses/teachers'),
  memberResults: (memberId: number) => api.get<MemberCourseResult[]>(`/courses/member/${memberId}`),

  runs: (p: RunListParams) => api.get<CourseRun[]>('/course-runs', { params: p }),
  run: (id: number) => api.get<CourseRun>(`/course-runs/${id}`),
  createRun: (input: RunInput) => api.post<CourseRun>('/course-runs', input),
  updateRun: (id: number, input: Partial<RunInput>) => api.patch<CourseRun>(`/course-runs/${id}`, input),
  removeRun: (id: number) => api.delete(`/course-runs/${id}`),
  setAssessments: (id: number, assessments: { id?: number; name: string; maxScore: number }[]) =>
    api.put<CourseRun>(`/course-runs/${id}/assessments`, { assessments }),
  marks: (id: number) => api.get<Gradebook>(`/course-runs/${id}/marks`),
  setMarks: (id: number, scores: ScoreInput[]) => api.put<Gradebook>(`/course-runs/${id}/marks`, { scores }),
}

export function useCourses(p: CourseListParams) {
  return useQuery({ queryKey: courseKeys.list(p), queryFn: () => coursesApi.list(p), placeholderData: keepPreviousData })
}

export function useCourse(id: number) {
  return useQuery({ queryKey: courseKeys.detail(id), queryFn: () => coursesApi.get(id), enabled: id > 0 })
}

export function useRuns(p: RunListParams, enabled = true) {
  return useQuery({ queryKey: courseKeys.runs(p), queryFn: () => coursesApi.runs(p), enabled, placeholderData: keepPreviousData })
}

export function useGradebook(id: number) {
  return useQuery({ queryKey: courseKeys.marks(id), queryFn: () => coursesApi.marks(id), enabled: id > 0 })
}

export function useTeachers(enabled = true) {
  return useQuery({ queryKey: courseKeys.teachers(), queryFn: coursesApi.teachers, enabled, staleTime: 60_000 })
}

export function useMemberCourseResults(memberId: number, enabled = true) {
  return useQuery({
    queryKey: courseKeys.member(memberId),
    queryFn: () => coursesApi.memberResults(memberId),
    enabled: enabled && memberId > 0,
  })
}

export function useCourseMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => void qc.invalidateQueries({ queryKey: courseKeys.all }) })
}
