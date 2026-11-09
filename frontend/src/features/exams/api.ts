import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type {
  CandidateSearchResult,
  Exam,
  ExamInput,
  ExamListParams,
  ExamMarkInput,
  ExamPartInput,
  ExamSheet,
  MemberExam,
} from './types'

export const examKeys = {
  all: ['exams'] as const,
  list: (p: ExamListParams) => [...examKeys.all, 'list', p] as const,
  sheet: (id: number) => [...examKeys.all, 'sheet', id] as const,
  search: (id: number, q: string) => [...examKeys.all, 'search', id, q] as const,
  member: (memberId: number) => [...examKeys.all, 'member', memberId] as const,
}

export const examsApi = {
  list: (params: ExamListParams) => api.get<Exam[]>('/exams', { params }),
  sheet: (id: number) => api.get<ExamSheet>(`/exams/${id}/sheet`),
  create: (input: ExamInput & { parts: ExamPartInput[] }) => api.post<Exam>('/exams', input),
  update: (id: number, input: Partial<ExamInput>) => api.patch<Exam>(`/exams/${id}`, input),
  remove: (id: number) => api.delete(`/exams/${id}`),
  setParts: (id: number, parts: ExamPartInput[]) => api.put<Exam>(`/exams/${id}/parts`, { parts }),
  addCandidates: (id: number, input: { memberIds?: number[]; classGradeId?: number; wholeClass?: boolean }) =>
    api.post<ExamSheet & { added: number }>(`/exams/${id}/candidates`, input),
  removeCandidate: (id: number, memberId: number) => api.delete(`/exams/${id}/candidates/${memberId}`),
  candidateSearch: (id: number, search: string) =>
    api.get<CandidateSearchResult[]>(`/exams/${id}/candidate-search`, { params: { search } }),
  setMarks: (id: number, marks: ExamMarkInput[]) => api.put<ExamSheet>(`/exams/${id}/marks`, { marks }),
  member: (memberId: number) => api.get<MemberExam[]>(`/exams/member/${memberId}`),
}

export function useExams(params: ExamListParams) {
  return useQuery({
    queryKey: examKeys.list(params),
    queryFn: () => examsApi.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useExamSheet(id: number) {
  return useQuery({ queryKey: examKeys.sheet(id), queryFn: () => examsApi.sheet(id), enabled: id > 0 })
}

export function useCandidateSearch(id: number, search: string, enabled: boolean) {
  return useQuery({
    queryKey: examKeys.search(id, search),
    queryFn: () => examsApi.candidateSearch(id, search),
    enabled: enabled && search.length >= 2,
    placeholderData: keepPreviousData,
  })
}

export function useMemberExams(memberId: number, enabled = true) {
  return useQuery({ queryKey: examKeys.member(memberId), queryFn: () => examsApi.member(memberId), enabled })
}

/** Wraps an exam mutation so every exam view (list, sheet, member pages) refreshes. */
export function useExamMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => void qc.invalidateQueries({ queryKey: examKeys.all }),
  })
}
