import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, http } from '@/lib/api/client'
import { memberKeys } from '@/features/members/api'
import type {
  Department,
  DepartmentDetail,
  DepartmentInput,
  DepartmentMembership,
  DepartmentRole,
  FormerService,
  MemberSummary,
} from './types'

export const departmentKeys = {
  all: ['departments'] as const,
  list: (includeInactive: boolean) => [...departmentKeys.all, 'list', { includeInactive }] as const,
  detail: (id: number) => [...departmentKeys.all, 'detail', id] as const,
  members: (id: number) => [...departmentKeys.all, 'members', id] as const,
  history: (id: number) => [...departmentKeys.all, 'history', id] as const,
  candidates: (id: number, search: string) => [...departmentKeys.all, 'candidates', id, search] as const,
}

export const departmentsApi = {
  list: (includeInactive: boolean) => api.get<Department[]>('/departments', { params: { includeInactive } }),
  get: (id: number) => api.get<DepartmentDetail>(`/departments/${id}`),
  create: (input: DepartmentInput) => api.post<Department>('/departments', input),
  createSubDepartment: (parentId: number, input: Omit<DepartmentInput, 'parentId'> & { headMemberId: number }) =>
    api.post<Department>(`/departments/${parentId}/sub-departments`, input),
  update: (id: number, input: Partial<Omit<DepartmentInput, 'code'>>) =>
    api.patch<Department>(`/departments/${id}`, input),
  remove: (id: number) => api.delete(`/departments/${id}`),
  reorder: (parentId: number | null, ids: number[]) =>
    http.put('/departments/order', { parentId, ids }).then(() => undefined),
  members: (id: number) => api.get<DepartmentMembership[]>(`/departments/${id}/members`),
  history: (id: number) => api.get<FormerService[]>(`/departments/${id}/history`),
  /** Any member matching the search (not just the user's own), for adding to the roster. */
  candidates: (id: number, search: string) =>
    api.get<MemberSummary[]>(`/departments/${id}/candidates`, { params: { search: search || undefined } }),
  addMember: (id: number, input: { memberId: number; role: DepartmentRole; joinedAt?: string }) =>
    api.post(`/departments/${id}/members`, input),
  updateMembership: (id: number, input: { role?: DepartmentRole; joinedAt?: string }) =>
    api.patch(`/department-memberships/${id}`, input),
  removeMembership: (id: number) => api.delete(`/department-memberships/${id}`),
}

export function useDepartments(includeInactive = false) {
  return useQuery({
    queryKey: departmentKeys.list(includeInactive),
    queryFn: () => departmentsApi.list(includeInactive),
    staleTime: 60_000,
  })
}

export function useDepartment(id: number) {
  return useQuery({
    queryKey: departmentKeys.detail(id),
    queryFn: () => departmentsApi.get(id),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useDepartmentMembers(id: number) {
  return useQuery({
    queryKey: departmentKeys.members(id),
    queryFn: () => departmentsApi.members(id),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useDepartmentCandidates(id: number, search: string, enabled: boolean) {
  return useQuery({
    queryKey: departmentKeys.candidates(id, search),
    queryFn: () => departmentsApi.candidates(id, search),
    enabled: enabled && id > 0,
    placeholderData: (prev) => prev,
  })
}

export function useDepartmentHistory(id: number) {
  return useQuery({
    queryKey: departmentKeys.history(id),
    queryFn: () => departmentsApi.history(id),
    enabled: Number.isInteger(id) && id > 0,
  })
}

/** Department mutations refresh every department view and member views that show departments. */
export function useDepartmentMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: departmentKeys.all })
      void qc.invalidateQueries({ queryKey: memberKeys.all })
    },
  })
}
