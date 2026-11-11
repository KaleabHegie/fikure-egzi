import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, http } from '@/lib/api/client'
import { attendanceKeys } from './api'

export type PermissionState = 'pending' | 'rejected' | 'upcoming' | 'active' | 'ended'

/** The boxes on the paper request form (ቅጽ 2). */
export const PERMISSION_TYPES = ['LATE_ARRIVAL', 'SICK_LEAVE', 'MISS_STUDY', 'LEAVE_EARLY', 'CONSECUTIVE_DAYS', 'OTHER'] as const
export type PermissionType = (typeof PERMISSION_TYPES)[number]
export const PERMISSION_DECISIONS = ['APPROVED', 'REJECTED', 'NEEDS_INFO', 'PENDING'] as const
export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number]

/** Translation key of each weekday, 0 = Sunday … 6 = Saturday. */
export const WEEKDAY_KEYS = [
  'attendance.permissions.weekdays.d0',
  'attendance.permissions.weekdays.d1',
  'attendance.permissions.weekdays.d2',
  'attendance.permissions.weekdays.d3',
  'attendance.permissions.weekdays.d4',
  'attendance.permissions.weekdays.d5',
  'attendance.permissions.weekdays.d6',
] as const

export interface PermissionMember {
  id: number
  memberCode: string
  firstName: string
  fatherName: string
  grandfatherName: string | null
  christianName: string | null
  phone: string | null
  hasPhoto: boolean
  updatedAt: string
}

/** A member's permission (ፈቃድ) for one department's classes, as on the paper form. */
export interface LatePermission {
  id: number
  /** The form number, e.g. PRM-00012. */
  code: string
  memberId: number
  departmentId: number
  type: PermissionType
  typeOther: string | null
  /** Late arrival only. */
  graceMinutes: number | null
  /** 0 = Sunday … 6 = Saturday */
  weekdays: number[]
  startsOn: string
  endsOn: string
  fromTime: string | null
  toTime: string | null
  reason: string
  requestedOn: string
  contactPhone: string | null
  memberConfirmed: boolean
  memberConfirmedOn: string | null
  decision: PermissionDecision
  decidedOn: string | null
  representativeName: string | null
  headName: string | null
  hasEvidence: boolean
  evidenceName: string | null
  evidenceType: string | null
  revokedAt: string | null
  createdAt: string
  state: PermissionState
  member: PermissionMember
  department: { id: number; nameAm: string; nameEn: string }
}

export interface LatePermissionInput {
  memberId: number
  departmentId: number
  type: PermissionType
  typeOther: string | null
  graceMinutes: number | null
  weekdays: number[]
  startsOn: string
  endsOn: string
  fromTime: string | null
  toTime: string | null
  reason: string
  requestedOn: string
  contactPhone: string | null
  memberConfirmed: boolean
  memberConfirmedOn: string | null
  decision: PermissionDecision
  decidedOn: string | null
  representativeName: string | null
  headName: string | null
}

export interface PermissionListParams {
  state?: PermissionState | 'all'
  type?: PermissionType
  departmentId?: number
  search?: string
  memberId?: number
}

const BASE = '/attendance/late-permissions'

export const permissionKeys = {
  all: [...attendanceKeys.all, 'late-permissions'] as const,
  list: (p: PermissionListParams) => [...permissionKeys.all, 'list', p] as const,
  departments: () => [...permissionKeys.all, 'departments'] as const,
  candidates: (departmentId: number, search: string) =>
    [...permissionKeys.all, 'candidates', departmentId, search] as const,
}

export const permissionsApi = {
  list: (params: PermissionListParams) => api.get<LatePermission[]>(BASE, { params }),
  departments: () => api.get<{ id: number; nameAm: string; nameEn: string }[]>(`${BASE}/departments`),
  candidates: (departmentId: number, search: string) =>
    api.get<PermissionMember[]>(`${BASE}/candidates`, { params: { departmentId, search: search || undefined } }),
  create: (input: LatePermissionInput) => api.post<LatePermission>(BASE, input),
  update: (id: number, input: Partial<LatePermissionInput>) => api.patch<LatePermission>(`${BASE}/${id}`, input),
  end: (id: number) => api.post<LatePermission>(`${BASE}/${id}/end`),
  remove: (id: number) => api.delete(`${BASE}/${id}`),
  uploadEvidence: (id: number, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return api.put<LatePermission>(`${BASE}/${id}/evidence`, body)
  },
  removeEvidence: (id: number) => http.delete(`${BASE}/${id}/evidence`).then(() => undefined),
  /** The evidence file as a blob (it needs the sign-in, so it can't be a plain link). */
  evidence: (id: number) => http.get<Blob>(`${BASE}/${id}/evidence`, { responseType: 'blob' }).then((r) => r.data),
}

export function useLatePermissions(params: PermissionListParams, enabled = true) {
  return useQuery({
    queryKey: permissionKeys.list(params),
    queryFn: () => permissionsApi.list(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function usePermissionDepartments() {
  return useQuery({ queryKey: permissionKeys.departments(), queryFn: permissionsApi.departments, staleTime: 5 * 60_000 })
}

export function usePermissionCandidates(departmentId: number | null, search: string, enabled: boolean) {
  return useQuery({
    queryKey: permissionKeys.candidates(departmentId ?? 0, search),
    queryFn: () => permissionsApi.candidates(departmentId!, search),
    enabled: enabled && departmentId !== null,
    placeholderData: keepPreviousData,
  })
}

/** Wraps a permission change so every list (and the session rosters) refresh. */
export function usePermissionMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => void qc.invalidateQueries({ queryKey: attendanceKeys.all }) })
}
