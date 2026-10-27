import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type {
  GroupCandidate,
  MemberServiceGroup,
  ServiceGroup,
  ServiceGroupInput,
  ServiceTerm,
  ServiceTermInput,
} from './types'

export const serviceGroupKeys = {
  all: ['service-groups'] as const,
  terms: () => [...serviceGroupKeys.all, 'terms'] as const,
  groups: (termId: number) => [...serviceGroupKeys.all, 'groups', termId] as const,
  candidates: (termId: number, params: object) => [...serviceGroupKeys.all, 'candidates', termId, params] as const,
  member: (memberId: number) => [...serviceGroupKeys.all, 'member', memberId] as const,
}

export const serviceGroupsApi = {
  terms: () => api.get<ServiceTerm[]>('/service-terms'),
  createTerm: (input: ServiceTermInput) => api.post<ServiceTerm>('/service-terms', input),
  updateTerm: (id: number, input: Partial<ServiceTermInput>) => api.patch<ServiceTerm>(`/service-terms/${id}`, input),
  removeTerm: (id: number) => api.delete(`/service-terms/${id}`),
  groups: (termId: number) => api.get<ServiceGroup[]>(`/service-terms/${termId}/groups`),
  createGroup: (termId: number, input: ServiceGroupInput) =>
    api.post<ServiceGroup>(`/service-terms/${termId}/groups`, input),
  updateGroup: (id: number, input: Partial<ServiceGroupInput>) => api.patch<ServiceGroup>(`/service-groups/${id}`, input),
  removeGroup: (id: number) => api.delete(`/service-groups/${id}`),
  assign: (groupId: number, memberIds: number[]) =>
    api.put<{ assigned: number }>(`/service-groups/${groupId}/members`, { memberIds }),
  unassign: (groupId: number, memberId: number) => api.delete(`/service-groups/${groupId}/members/${memberId}`),
  distribute: (termId: number, input: { classGradeId: number; groupIds: number[]; onlyUnassigned: boolean }) =>
    api.post<{ assigned: number }>(`/service-terms/${termId}/distribute`, input),
  candidates: (termId: number, params: { classGradeId?: number; search?: string }) =>
    api.get<GroupCandidate[]>(`/service-terms/${termId}/candidates`, { params }),
  forMember: (memberId: number) => api.get<MemberServiceGroup[]>(`/members/${memberId}/service-groups`),
}

export function useServiceTerms() {
  return useQuery({ queryKey: serviceGroupKeys.terms(), queryFn: serviceGroupsApi.terms, staleTime: 60_000 })
}

export function useServiceGroups(termId: number | undefined) {
  return useQuery({
    queryKey: serviceGroupKeys.groups(termId ?? 0),
    queryFn: () => serviceGroupsApi.groups(termId!),
    enabled: !!termId,
  })
}

export function useGroupCandidates(termId: number, params: { classGradeId?: number; search?: string }, enabled: boolean) {
  return useQuery({
    queryKey: serviceGroupKeys.candidates(termId, params),
    queryFn: () => serviceGroupsApi.candidates(termId, params),
    enabled,
    placeholderData: (prev) => prev,
  })
}

export function useMemberServiceGroups(memberId: number) {
  return useQuery({ queryKey: serviceGroupKeys.member(memberId), queryFn: () => serviceGroupsApi.forMember(memberId) })
}

/** Any change can move counts in terms, groups and member pages, so refresh them all. */
export function useServiceGroupMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => void qc.invalidateQueries({ queryKey: serviceGroupKeys.all }),
  })
}
