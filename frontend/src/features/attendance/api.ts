import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { memberKeys } from '@/features/members/api'
import { api } from '@/lib/api/client'
import type {
  TopAttendanceReport,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  LowAttendanceReport,
  MemberAttendanceSummary,
  RosterRow,
  ScanResult,
  SessionInput,
  SessionKind,
  SessionStatus,
} from './types'

export interface SessionListParams {
  page: number
  pageSize: number
  kind?: SessionKind
  status?: SessionStatus
  from?: string
  to?: string
}

export interface LowAttendanceParams {
  from?: string
  to?: string
  threshold: number
  minSessions: number
  kind?: SessionKind
  classGradeId?: number
  departmentId?: number
}

export const attendanceKeys = {
  all: ['attendance'] as const,
  sessions: (p: SessionListParams) => [...attendanceKeys.all, 'sessions', p] as const,
  session: (id: number) => [...attendanceKeys.all, 'session', id] as const,
  roster: (id: number) => [...attendanceKeys.all, 'roster', id] as const,
  low: (p: LowAttendanceParams) => [...attendanceKeys.all, 'low', p] as const,
  member: (id: number) => [...attendanceKeys.all, 'member', id] as const,
}

const BASE = '/attendance/sessions'

export const attendanceApi = {
  list: (p: SessionListParams) => api.getPage<AttendanceSession>(BASE, p),
  get: (id: number) => api.get<AttendanceSession>(`${BASE}/${id}`),
  create: (input: SessionInput) => api.post<AttendanceSession>(BASE, input),
  update: (id: number, input: Partial<Omit<SessionInput, 'kind'>>) => api.patch<AttendanceSession>(`${BASE}/${id}`, input),
  remove: (id: number) => api.delete(`${BASE}/${id}`),
  close: (id: number) => api.post<AttendanceSession>(`${BASE}/${id}/close`),
  reopen: (id: number) => api.post<AttendanceSession>(`${BASE}/${id}/reopen`),
  roster: (id: number) => api.get<RosterRow[]>(`${BASE}/${id}/roster`),
  scan: (id: number, code: string) => api.post<ScanResult>(`${BASE}/${id}/scan`, { code }),
  mark: (id: number, memberId: number, status: AttendanceStatus, note?: string | null) =>
    api.put<AttendanceRecord>(`${BASE}/${id}/records/${memberId}`, { status, note }),
  unmark: (id: number, memberId: number) => api.delete(`${BASE}/${id}/records/${memberId}`),
  lowAttendance: (p: LowAttendanceParams) =>
    api.get<LowAttendanceReport>('/attendance/reports/low-attendance', { params: p }),
  /** A member's attendance; `from`/`to` (Gregorian YYYY-MM-DD) narrow the period. */
  topAttendance: (sessionIds: number[], limit = 100) =>
    api.get<TopAttendanceReport>('/attendance/reports/top-attendance', { params: { sessionIds: sessionIds.join(','), limit } }),
  memberSummary: (memberId: number, range: { from?: string; to?: string } = {}) =>
    api.get<MemberAttendanceSummary>(`/members/${memberId}/attendance`, { params: range }),
}

export function useSessions(p: SessionListParams) {
  return useQuery({ queryKey: attendanceKeys.sessions(p), queryFn: () => attendanceApi.list(p), placeholderData: keepPreviousData })
}

export function useSession(id: number) {
  return useQuery({ queryKey: attendanceKeys.session(id), queryFn: () => attendanceApi.get(id), enabled: id > 0 })
}

export function useRoster(id: number, enabled = true) {
  return useQuery({ queryKey: attendanceKeys.roster(id), queryFn: () => attendanceApi.roster(id), enabled: enabled && id > 0 })
}

export function useLowAttendance(p: LowAttendanceParams) {
  return useQuery({ queryKey: attendanceKeys.low(p), queryFn: () => attendanceApi.lowAttendance(p) })
}

export function useMemberAttendance(memberId: number, range: { from?: string; to?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: [...attendanceKeys.member(memberId), range],
    queryFn: () => attendanceApi.memberSummary(memberId, range),
    enabled: enabled && memberId > 0,
    placeholderData: keepPreviousData,
  })
}

/** Attendance mutations refresh every attendance view and member views that show attendance. */
export function useAttendanceMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: attendanceKeys.all })
      void qc.invalidateQueries({ queryKey: memberKeys.all })
    },
  })
}
