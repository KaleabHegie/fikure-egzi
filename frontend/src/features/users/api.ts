import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, http } from '@/lib/api/client'
import type { MemberCandidate, SystemUser, UserInput, UserRole } from './types'

export const userKeys = {
  all: ['users'] as const,
  list: (search: string) => [...userKeys.all, 'list', search] as const,
  roles: () => [...userKeys.all, 'roles'] as const,
  candidates: (search: string) => [...userKeys.all, 'candidates', search] as const,
}

export const usersApi = {
  list: (search: string) => api.get<SystemUser[]>('/users', { params: { search: search || undefined } }),
  roles: () => api.get<UserRole[]>('/users/roles'),
  memberCandidates: (search: string) => api.get<MemberCandidate[]>('/users/member-candidates', { params: { search } }),
  create: (input: UserInput) => api.post<SystemUser>('/users', input),
  update: (id: number, input: Partial<UserInput>) => api.patch<SystemUser>(`/users/${id}`, input),
  setPassword: (id: number, password: string) =>
    http.put(`/users/${id}/password`, { password }).then(() => undefined),
}

export function useUsers(search: string) {
  return useQuery({ queryKey: userKeys.list(search), queryFn: () => usersApi.list(search), placeholderData: (p) => p })
}

/** Members to link a teacher login to, searched across the whole register. */
export function useMemberCandidates(search: string, enabled: boolean) {
  return useQuery({
    queryKey: userKeys.candidates(search),
    queryFn: () => usersApi.memberCandidates(search),
    enabled,
    placeholderData: (p) => p,
  })
}

export function useAssignableRoles() {
  return useQuery({ queryKey: userKeys.roles(), queryFn: usersApi.roles, staleTime: 5 * 60_000 })
}

export function useUserMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => void qc.invalidateQueries({ queryKey: userKeys.all }) })
}
